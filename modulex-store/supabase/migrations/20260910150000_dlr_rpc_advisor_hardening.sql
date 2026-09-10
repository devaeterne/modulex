-- DLR-A4 — keep exposed Dealer lifecycle RPCs SECURITY INVOKER.
--
-- Supabase Advisor flags authenticated-callable SECURITY DEFINER functions in exposed
-- schemas. The Dealer mutation implementations already perform their own role checks;
-- keep elevation behind the non-exposed private schema and expose only invoker wrappers.

begin;

-- The review wrapper must retain its PL/pgSQL exception subtransaction so structured
-- `ok=false` results roll back temporary approval/conversion side effects. It does not
-- itself need elevated privileges; the private implementation owns the guarded elevation.
alter function public.review_store_dealer_application(uuid, text, text, uuid)
  security invoker;

grant execute on function private.review_store_dealer_application(uuid, text, text, uuid)
  to authenticated;

-- Move Dealer account transition implementation out of the exposed API schema and leave
-- a narrow invoker wrapper, matching existing Store Portal RPC architecture.
alter function public.transition_store_dealer_account(uuid, text, text)
  set schema private;

revoke all on function private.transition_store_dealer_account(uuid, text, text)
  from public, anon, authenticated;
grant execute on function private.transition_store_dealer_account(uuid, text, text)
  to authenticated;

create function public.transition_store_dealer_account(
  p_customer_id uuid,
  p_transition text,
  p_reason text
)
returns jsonb
language sql
security invoker
set search_path = ''
volatile
as $$
  select private.transition_store_dealer_account(p_customer_id, p_transition, p_reason);
$$;

revoke all on function public.transition_store_dealer_account(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.transition_store_dealer_account(uuid, text, text)
  to authenticated;

comment on function public.transition_store_dealer_account(uuid, text, text) is
  'DLR exposed invoker wrapper for the private Admin-only Dealer deactivate/reactivate lifecycle implementation.';

notify pgrst, 'reload schema';

commit;
