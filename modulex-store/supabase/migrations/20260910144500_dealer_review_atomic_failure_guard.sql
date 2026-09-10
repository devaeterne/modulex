-- DLR-A1 — keep failed Dealer review/onboarding attempts transactionally side-effect free.
--
-- The first DLR closeout migration intentionally reused the canonical dealer conversion
-- function. That function requires an approved lead, so review_store_dealer_application
-- temporarily promoted the application before calling it. A duplicate_customer JSON
-- result is not an exception, which meant the temporary approval could survive even
-- though onboarding failed. Wrap the existing implementation in a subtransaction and
-- roll back every non-ok result while preserving the structured response for Admin UX.

begin;

alter function public.review_store_dealer_application(uuid, text, text, uuid)
  set schema private;

revoke all on function private.review_store_dealer_application(uuid, text, text, uuid)
from public, anon, authenticated;

comment on function private.review_store_dealer_application(uuid, text, text, uuid) is
  'DLR internal review implementation. Invoke through public.review_store_dealer_application so failed structured results are atomic.';

create function public.review_store_dealer_application(
  p_lead_id uuid,
  p_decision text,
  p_reason text,
  p_existing_customer_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
volatile
as $$
declare
  v_result jsonb;
begin
  begin
    v_result := private.review_store_dealer_application(
      p_lead_id,
      p_decision,
      p_reason,
      p_existing_customer_id
    );

    if coalesce((v_result->>'ok')::boolean, false) is not true then
      raise exception 'dlr_review_atomic_failure_guard' using errcode = 'PZ101';
    end if;

    return v_result;
  exception
    when sqlstate 'PZ101' then
      -- PL/pgSQL exception blocks are subtransactions: persistent changes made by the
      -- internal implementation are rolled back, while v_result remains available.
      return v_result;
  end;
end;
$$;

revoke all on function public.review_store_dealer_application(uuid, text, text, uuid)
from public, anon, authenticated;
grant execute on function public.review_store_dealer_application(uuid, text, text, uuid)
to authenticated;

comment on function public.review_store_dealer_application(uuid, text, text, uuid) is
  'DLR canonical Dealer Application review/onboarding. Admin-only, reasoned, duplicate-safe, retry-safe, and atomic on structured failure.';

notify pgrst, 'reload schema';

commit;
