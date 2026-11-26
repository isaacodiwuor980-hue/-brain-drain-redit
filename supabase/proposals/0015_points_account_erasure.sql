-- LOCAL REVIEW ONLY. Requires proposal 0014; do not apply to a live project.
-- Removes points rows for one authenticated, verified account as part of an
-- authorized account-deletion transaction. The service must verify ownership;
-- this function cannot authenticate a UUID supplied by a caller. It does not
-- delete auth.users or other personal data, backups, analytics, caches or logs.
-- The caller MUST lock/delete the auth account in the SAME transaction before
-- committing, otherwise a new wallet can be opened after erasure. Full deletion,
-- retry, backup retention, legal and concurrency policies require review.

-- Transaction-scoped permission marker, writable only by the function owner.
-- This is not accessible to untrusted roles or the API service role directly.
CREATE TABLE public.feed_points_erasure_guard (
  transaction_id bigint NOT NULL,
  user_id uuid NOT NULL,
  PRIMARY KEY (transaction_id, user_id)
);
ALTER TABLE public.feed_points_erasure_guard ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.feed_points_erasure_guard FROM PUBLIC, anon, authenticated, service_role;

-- Preserve append-only behavior except for an account erasure in this same
-- transaction. A session-set variable alone is not sufficient authorization.
CREATE OR REPLACE FUNCTION public.feed_points_ledger_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF TG_OP = 'DELETE' AND EXISTS (
    SELECT 1 FROM public.feed_points_erasure_guard
      WHERE transaction_id=txid_current() AND user_id=OLD.user_id
  ) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'Ledger entries are append-only' USING ERRCODE='55000';
END $$;

CREATE FUNCTION public.feed_erase_points_account(p_uid uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF p_uid IS NULL THEN RAISE EXCEPTION 'Invalid identity' USING ERRCODE='22023'; END IF;
  -- The row lock prevents a concurrent wallet open until this transaction ends.
  PERFORM 1 FROM auth.users WHERE id=p_uid FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  PERFORM 1 FROM public.feed_point_wallets WHERE user_id=p_uid FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  INSERT INTO public.feed_points_erasure_guard(transaction_id,user_id) VALUES (txid_current(),p_uid);
  DELETE FROM public.feed_points_ledger WHERE user_id=p_uid;
  DELETE FROM public.feed_points_requests WHERE user_id=p_uid;
  DELETE FROM public.feed_point_stakes WHERE user_id=p_uid;
  DELETE FROM public.feed_point_wallets WHERE user_id=p_uid;
  DELETE FROM public.feed_points_erasure_guard WHERE transaction_id=txid_current() AND user_id=p_uid;
END $$;
REVOKE ALL ON FUNCTION public.feed_erase_points_account(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.feed_erase_points_account(uuid) TO service_role;
