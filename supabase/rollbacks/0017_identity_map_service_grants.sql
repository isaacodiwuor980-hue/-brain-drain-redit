-- REVIEW ONLY. Restores the broad DML grant from migration 0007, allowing the
-- service role to alter identity links directly. Never run without explicit
-- approval, a replacement protection, and verified access/rollback planning.
-- Does not restore data or validate the ownership of any existing mapping.
GRANT INSERT, UPDATE, DELETE ON public.user_identity_map TO service_role;
