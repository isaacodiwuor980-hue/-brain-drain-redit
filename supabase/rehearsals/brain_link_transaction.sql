-- PROPOSED TEST ONLY; DO NOT EXECUTE WITHOUT SPECIFIC APPROVAL.
-- One PostgreSQL session must execute this whole script, with ordinary
-- transactional DDL and without an outer transaction. Any pre-existing schema
-- of this name makes CREATE SCHEMA fail. This creates only synthetic objects;
-- it does not alter public tables or apply proposal 0019. ROLLBACK removes the
-- test schema on successful execution. On error the client must roll back or
-- disconnect, then confirm the schema is absent. Abort if session/transaction
-- semantics cannot be guaranteed. No roles, extensions, flags or auth users.
BEGIN;
SET LOCAL statement_timeout = '10s';
SET LOCAL lock_timeout = '2s';
CREATE SCHEMA arena_brain_visibility_rehearsal;
REVOKE ALL ON SCHEMA arena_brain_visibility_rehearsal FROM PUBLIC;
CREATE TABLE arena_brain_visibility_rehearsal.brains(id text PRIMARY KEY, is_public boolean NOT NULL);
CREATE TABLE arena_brain_visibility_rehearsal.posts(id text PRIMARY KEY, content text NOT NULL, brain_id text REFERENCES arena_brain_visibility_rehearsal.brains(id) ON DELETE SET NULL);
CREATE FUNCTION arena_brain_visibility_rehearsal.check_attachment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,arena_brain_visibility_rehearsal AS $$
DECLARE v_public boolean;
BEGIN
  IF NEW.brain_id IS NULL THEN RETURN NEW; END IF;
  SELECT is_public INTO v_public FROM arena_brain_visibility_rehearsal.brains WHERE id=NEW.brain_id FOR SHARE;
  IF NOT FOUND OR v_public IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Brain attachment unavailable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE FUNCTION arena_brain_visibility_rehearsal.detach_private() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,arena_brain_visibility_rehearsal AS $$
BEGIN
  IF NEW.is_public IS DISTINCT FROM true AND OLD.is_public IS DISTINCT FROM NEW.is_public THEN
    UPDATE arena_brain_visibility_rehearsal.posts SET brain_id=NULL WHERE brain_id=OLD.id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER check_attachment BEFORE INSERT OR UPDATE OF brain_id ON arena_brain_visibility_rehearsal.posts FOR EACH ROW EXECUTE FUNCTION arena_brain_visibility_rehearsal.check_attachment();
CREATE TRIGGER detach_private AFTER UPDATE OF is_public ON arena_brain_visibility_rehearsal.brains FOR EACH ROW EXECUTE FUNCTION arena_brain_visibility_rehearsal.detach_private();
INSERT INTO arena_brain_visibility_rehearsal.brains VALUES ('synthetic-public',true),('synthetic-private',false),('synthetic-other',true);
INSERT INTO arena_brain_visibility_rehearsal.posts VALUES ('synthetic-post','synthetic-content','synthetic-public'),('synthetic-other-post','synthetic-content','synthetic-other');
DO $$
BEGIN
  BEGIN
    INSERT INTO arena_brain_visibility_rehearsal.posts VALUES ('synthetic-rejected','synthetic-content','synthetic-private');
    RAISE EXCEPTION 'Private link unexpectedly accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  UPDATE arena_brain_visibility_rehearsal.brains SET is_public=false WHERE id='synthetic-public';
  IF NOT EXISTS (SELECT 1 FROM arena_brain_visibility_rehearsal.posts WHERE id='synthetic-post' AND brain_id IS NULL AND content='synthetic-content') THEN
    RAISE EXCEPTION 'Expected detached link and preserved post';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM arena_brain_visibility_rehearsal.posts WHERE id='synthetic-other-post' AND brain_id='synthetic-other') THEN
    RAISE EXCEPTION 'Unrelated link changed';
  END IF;
END $$;
ROLLBACK;
SELECT 'synthetic rehearsal completed; verify schema absence separately' AS result;
