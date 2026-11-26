-- LOCAL SYNTHETIC REVIEW ONLY. Do not apply to any cloud project.
-- The owner chose to detach a public post's brain link when that brain becomes
-- private, preserving post and brain content. This proposal has NOT audited
-- existing links, role inheritance, trigger side effects, RLS/owners, schema
-- compatibility, or concurrent transactions on real Postgres. It does not
-- repair old invalid links. No automatic backfill is included: any live data
-- change, deployment, rollback or deletion needs a specific plan and approval.
-- A database owner/superuser may disable triggers; other content, embeds,
-- caches, replicas and routes can still leak identifiers. This is not complete
-- privacy or authorization. UPDATE/INSERT may deadlock with visibility changes;
-- safe retry behavior and lock ordering require independent testing/review.

CREATE FUNCTION public.experimental_check_public_brain_attachment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_public boolean;
BEGIN
  IF NEW.brain_id IS NULL THEN RETURN NEW; END IF;
  -- Hold the brain row until transaction end, serializing this write against
  -- a concurrent transition of is_public. The check does not authenticate users.
  SELECT is_public INTO v_public FROM public.brains WHERE id=NEW.brain_id FOR SHARE;
  IF NOT FOUND OR v_public IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Brain attachment unavailable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION public.experimental_detach_private_brain() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF NEW.is_public IS DISTINCT FROM true AND OLD.is_public IS DISTINCT FROM NEW.is_public THEN
    UPDATE public.posts SET brain_id=NULL WHERE brain_id=OLD.id;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.experimental_check_public_brain_attachment(),public.experimental_detach_private_brain() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER experimental_check_public_brain_attachment
BEFORE INSERT OR UPDATE OF brain_id ON public.posts FOR EACH ROW
EXECUTE FUNCTION public.experimental_check_public_brain_attachment();
CREATE TRIGGER experimental_detach_private_brain
AFTER UPDATE OF is_public ON public.brains FOR EACH ROW
EXECUTE FUNCTION public.experimental_detach_private_brain();
