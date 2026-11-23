-- REVIEW ONLY: do not execute without authorization, verified backup and a plan.
-- Stop every consumer of this V2 function first. This removes the function but
-- preserves vote rows and does not undo any actions it has performed. Restoring
-- the legacy setter changes eligibility and requires separate policy approval.
DROP FUNCTION IF EXISTS public.set_tiered_post_vote_v2(text,text,text,text);
