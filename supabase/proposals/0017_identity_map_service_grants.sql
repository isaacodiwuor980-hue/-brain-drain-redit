-- LOCAL REVIEW ONLY. Requires migration 0007; never apply without an approved
-- migration plan and verified operational access. This prevents the API's
-- service role from directly creating, changing or deleting identity links.
-- It does not provision links, verify ownership, revoke an existing bad link,
-- restrict service-role reads or prevent SECURITY DEFINER functions, owners,
-- superusers or inherited/column grants from changing links. Audit all of those
-- in the target environment. A separately reviewed privileged process is needed
-- for provisioning, recovery, revocation and account deletion. This proposal
-- deliberately does not change server_feature_flags privileges.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.user_identity_map FROM service_role;
