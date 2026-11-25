-- REVIEW-ONLY: do not run on a live database. Removing the experimental
-- function does not reverse or recover votes, request receipts, revisions, old
-- writer behavior or privacy exposures. Tables and data are shared with 0023.
-- Any actual rollback requires a separately approved, schema-specific plan.
DROP FUNCTION IF EXISTS public.experimental_set_vote_two_step(text,text,text,bigint,uuid);
