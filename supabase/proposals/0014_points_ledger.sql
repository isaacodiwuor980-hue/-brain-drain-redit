-- LOCAL TESTING / REVIEW ONLY. NOT an automatic migration or live feature.
-- Points are noncash, nontransferable. This draft models the 1000-point grant,
-- reservation and release only. It does NOT implement voting, tier pricing,
-- evidence, burn/slashing, appeals, account-age, fraud prevention, or UI.
-- Trusted API must authenticate and resolve p_uid. No client-provided identity
-- or stake amount may be trusted without a separately reviewed product policy.
-- Restrictive FKs and append-only records require an approved account-deletion,
-- retention and backup/restore design before use with real accounts.
CREATE TABLE public.feed_point_wallets (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
  available integer NOT NULL CHECK (available >= 0),
  reserved integer NOT NULL CHECK (reserved >= 0),
  CHECK (available + reserved = 1000)
);
CREATE TABLE public.feed_point_stakes (
  stake_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.feed_point_wallets(user_id) ON DELETE RESTRICT,
  post_id text NOT NULL REFERENCES public.posts(id) ON DELETE RESTRICT,
  amount integer NOT NULL CHECK (amount > 0 AND amount <= 1000),
  state text NOT NULL CHECK (state IN ('reserved','released')),
  created_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz
);
-- Draft convention: one active reservation per account and post. This is not
-- a vote entitlement and must be reviewed before connecting to tiered votes.
CREATE UNIQUE INDEX feed_one_active_stake_per_post ON public.feed_point_stakes(user_id,post_id) WHERE state='reserved';
CREATE TABLE public.feed_points_requests (
  user_id uuid NOT NULL REFERENCES public.feed_point_wallets(user_id) ON DELETE RESTRICT,
  request_id uuid NOT NULL,
  operation text NOT NULL CHECK (operation IN ('reserve','release')),
  stake_id uuid NOT NULL,
  post_id text,
  amount integer,
  result jsonb NOT NULL,
  PRIMARY KEY (user_id, request_id)
);
CREATE TABLE public.feed_points_ledger (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.feed_point_wallets(user_id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('initial','reserve','release')),
  stake_id uuid REFERENCES public.feed_point_stakes(stake_id) ON DELETE RESTRICT,
  request_id uuid,
  available_delta integer NOT NULL,
  reserved_delta integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind='initial' AND stake_id IS NULL AND request_id IS NULL AND available_delta=1000 AND reserved_delta=0)
    OR (kind='reserve' AND stake_id IS NOT NULL AND request_id IS NOT NULL AND available_delta<0 AND reserved_delta=-available_delta)
    OR (kind='release' AND stake_id IS NOT NULL AND request_id IS NOT NULL AND reserved_delta<0 AND available_delta=-reserved_delta))
);
CREATE UNIQUE INDEX feed_points_one_initial ON public.feed_points_ledger(user_id) WHERE kind='initial';
CREATE UNIQUE INDEX feed_points_one_entry_per_request ON public.feed_points_ledger(user_id,request_id) WHERE request_id IS NOT NULL;
CREATE FUNCTION public.feed_points_ledger_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN RAISE EXCEPTION 'Ledger entries are append-only' USING ERRCODE='55000'; END $$;
CREATE TRIGGER feed_points_no_update_delete BEFORE UPDATE OR DELETE ON public.feed_points_ledger FOR EACH ROW EXECUTE FUNCTION public.feed_points_ledger_immutable();
ALTER TABLE public.feed_point_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_point_stakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_points_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_points_ledger ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.feed_point_wallets, public.feed_point_stakes, public.feed_points_requests, public.feed_points_ledger FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.feed_point_wallets, public.feed_point_stakes, public.feed_points_requests, public.feed_points_ledger TO service_role;

CREATE FUNCTION public.feed_open_points_wallet(p_uid uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_created boolean; v_wallet public.feed_point_wallets%ROWTYPE;
BEGIN
  IF p_uid IS NULL THEN RAISE EXCEPTION 'Invalid identity' USING ERRCODE='22023'; END IF;
  INSERT INTO public.feed_point_wallets(user_id,available,reserved) VALUES (p_uid,1000,0) ON CONFLICT (user_id) DO NOTHING;
  v_created := FOUND;
  SELECT * INTO v_wallet FROM public.feed_point_wallets WHERE user_id=p_uid FOR UPDATE;
  IF v_created THEN INSERT INTO public.feed_points_ledger(user_id,kind,available_delta,reserved_delta) VALUES (p_uid,'initial',1000,0); END IF;
  RETURN jsonb_build_object('available',v_wallet.available,'reserved',v_wallet.reserved);
END $$;

CREATE FUNCTION public.feed_reserve_points(p_uid uuid,p_request uuid,p_stake uuid,p_post text,p_amount integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_wallet public.feed_point_wallets%ROWTYPE; v_old public.feed_points_requests%ROWTYPE; v_result jsonb;
BEGIN
  IF p_uid IS NULL OR p_request IS NULL OR p_stake IS NULL OR p_post IS NULL OR p_post='' OR p_amount IS NULL OR p_amount<1 OR p_amount>1000 THEN RAISE EXCEPTION 'Invalid reservation' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_wallet FROM public.feed_point_wallets WHERE user_id=p_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Wallet not found' USING ERRCODE='P0002'; END IF;
  SELECT * INTO v_old FROM public.feed_points_requests WHERE user_id=p_uid AND request_id=p_request;
  IF FOUND THEN
    IF v_old.operation IS DISTINCT FROM 'reserve' OR v_old.stake_id IS DISTINCT FROM p_stake OR v_old.post_id IS DISTINCT FROM p_post OR v_old.amount IS DISTINCT FROM p_amount THEN RAISE EXCEPTION 'Request key reused' USING ERRCODE='22023'; END IF;
    RETURN v_old.result;
  END IF;
  IF v_wallet.available<p_amount THEN RAISE EXCEPTION 'Insufficient points' USING ERRCODE='23514'; END IF;
  INSERT INTO public.feed_point_stakes(stake_id,user_id,post_id,amount,state) VALUES (p_stake,p_uid,p_post,p_amount,'reserved');
  UPDATE public.feed_point_wallets SET available=available-p_amount,reserved=reserved+p_amount WHERE user_id=p_uid RETURNING * INTO v_wallet;
  INSERT INTO public.feed_points_ledger(user_id,kind,stake_id,request_id,available_delta,reserved_delta) VALUES (p_uid,'reserve',p_stake,p_request,-p_amount,p_amount);
  v_result := jsonb_build_object('stakeId',p_stake,'state','reserved','available',v_wallet.available,'reserved',v_wallet.reserved);
  INSERT INTO public.feed_points_requests(user_id,request_id,operation,stake_id,post_id,amount,result) VALUES (p_uid,p_request,'reserve',p_stake,p_post,p_amount,v_result);
  RETURN v_result;
END $$;

CREATE FUNCTION public.feed_release_points(p_uid uuid,p_request uuid,p_stake uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_wallet public.feed_point_wallets%ROWTYPE; v_old public.feed_points_requests%ROWTYPE; v_stake public.feed_point_stakes%ROWTYPE; v_result jsonb;
BEGIN
  IF p_uid IS NULL OR p_request IS NULL OR p_stake IS NULL THEN RAISE EXCEPTION 'Invalid release' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_wallet FROM public.feed_point_wallets WHERE user_id=p_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Wallet not found' USING ERRCODE='P0002'; END IF;
  SELECT * INTO v_old FROM public.feed_points_requests WHERE user_id=p_uid AND request_id=p_request;
  IF FOUND THEN
    IF v_old.operation IS DISTINCT FROM 'release' OR v_old.stake_id IS DISTINCT FROM p_stake THEN RAISE EXCEPTION 'Request key reused' USING ERRCODE='22023'; END IF;
    RETURN v_old.result;
  END IF;
  SELECT * INTO v_stake FROM public.feed_point_stakes WHERE stake_id=p_stake AND user_id=p_uid FOR UPDATE;
  IF NOT FOUND OR v_stake.state<>'reserved' THEN RAISE EXCEPTION 'Reservation not found' USING ERRCODE='P0002'; END IF;
  UPDATE public.feed_point_stakes SET state='released',released_at=now() WHERE stake_id=p_stake;
  UPDATE public.feed_point_wallets SET available=available+v_stake.amount,reserved=reserved-v_stake.amount WHERE user_id=p_uid RETURNING * INTO v_wallet;
  INSERT INTO public.feed_points_ledger(user_id,kind,stake_id,request_id,available_delta,reserved_delta) VALUES (p_uid,'release',p_stake,p_request,v_stake.amount,-v_stake.amount);
  v_result := jsonb_build_object('stakeId',p_stake,'state','released','available',v_wallet.available,'reserved',v_wallet.reserved);
  INSERT INTO public.feed_points_requests(user_id,request_id,operation,stake_id,result) VALUES (p_uid,p_request,'release',p_stake,v_result);
  RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.feed_points_ledger_immutable(), public.feed_open_points_wallet(uuid), public.feed_reserve_points(uuid,uuid,uuid,text,integer), public.feed_release_points(uuid,uuid,uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.feed_open_points_wallet(uuid), public.feed_reserve_points(uuid,uuid,uuid,text,integer), public.feed_release_points(uuid,uuid,uuid) TO service_role;
