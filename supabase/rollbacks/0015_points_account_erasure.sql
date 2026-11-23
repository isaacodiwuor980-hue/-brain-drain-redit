-- REVIEW ONLY. Revert consumers first and verify there are no active erasures.
-- This removes the erasure capability; it cannot restore erased account data.
-- Restore from an appropriately reviewed backup only with explicit approval.
DROP FUNCTION IF EXISTS public.feed_erase_points_account(uuid);
CREATE OR REPLACE FUNCTION public.feed_points_ledger_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN RAISE EXCEPTION 'Ledger entries are append-only' USING ERRCODE='55000'; END $$;
DROP TABLE IF EXISTS public.feed_points_erasure_guard;
