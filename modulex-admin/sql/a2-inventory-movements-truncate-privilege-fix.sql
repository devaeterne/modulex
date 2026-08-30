-- Phase A2.2 corrective migration: remove TRUNCATE from application-facing roles.
--
-- inventory_movements is an append-only audit ledger. RLS does not protect
-- TRUNCATE, so anon/authenticated must not retain table-level TRUNCATE privilege.
-- Keep ordinary INSERT/SELECT behavior governed by the existing A2.2 RLS and RPC
-- contracts; this migration changes no stock data and no movement rows.

begin;

revoke truncate on table public.inventory_movements from authenticated, anon;

commit;
