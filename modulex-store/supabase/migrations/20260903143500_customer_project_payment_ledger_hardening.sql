-- PB-3A hardening: no direct Data API access to financial ledger tables.
-- Public wrappers remain SECURITY INVOKER and delegate to private role-guarded
-- SECURITY DEFINER entrypoints, matching the established PB-2 ACL pattern.

alter table public.customer_project_payment_transactions
  add column if not exists voided_at timestamptz null,
  add column if not exists voided_by uuid null references public.profiles(id) on delete set null,
  add column if not exists void_reason text null;

create or replace function private.guard_posted_project_payment_transaction()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if old.status = 'voided' and new is distinct from old then
    raise exception using errcode = '23514', message = 'A voided Project payment transaction is immutable.';
  end if;

  if old.status = 'posted' then
    if new.project_id is distinct from old.project_id
       or new.customer_id is distinct from old.customer_id
       or new.transaction_type is distinct from old.transaction_type
       or new.amount is distinct from old.amount
       or new.currency_code is distinct from old.currency_code
       or new.transaction_date is distinct from old.transaction_date
       or new.payment_method_id is distinct from old.payment_method_id
       or new.reference_no is distinct from old.reference_no
       or new.reversal_of_transaction_id is distinct from old.reversal_of_transaction_id
       or new.notes is distinct from old.notes
       or new.created_by is distinct from old.created_by
       or new.created_at is distinct from old.created_at then
      raise exception using errcode = '23514', message = 'Posted Project payment transactions are immutable. Use reversal/refund for corrections.';
    end if;

    if new.status = 'posted' and (
      new.voided_at is distinct from old.voided_at
      or new.voided_by is distinct from old.voided_by
      or new.void_reason is distinct from old.void_reason
    ) then
      raise exception using errcode = '23514', message = 'Void metadata can only be recorded while voiding a posted Project payment.';
    end if;

    if new.status = 'voided' then
      if new.voided_at is null or new.void_reason is null or length(btrim(new.void_reason)) = 0 then
        raise exception using errcode = '23514', message = 'Voiding a Project payment requires immutable void audit metadata.';
      end if;
    elsif new.status is distinct from old.status then
      raise exception using errcode = '23514', message = 'Invalid Project payment status transition.';
    end if;
  end if;

  return new;
end;
$function$;

create or replace function private.void_customer_project_payment(
  p_payment_id uuid,
  p_reason text
)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_payment public.customer_project_payment_transactions%rowtype;
begin
  if auth.uid() is null
     or not private.current_user_has_any_role(array['super_admin','admin','finance']::text[]) then
    raise exception 'You do not have permission to void Project customer payments.' using errcode = '42501';
  end if;

  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception 'A void reason is required.';
  end if;

  select * into v_payment
  from public.customer_project_payment_transactions
  where id = p_payment_id
  for update;

  if v_payment.id is null or v_payment.status <> 'posted' then
    raise exception 'Posted payment transaction not found.';
  end if;

  if exists (select 1 from public.customer_project_payment_allocations a where a.transaction_id = p_payment_id)
     or exists (
       select 1
       from public.customer_project_payment_transactions t
       where t.reversal_of_transaction_id = p_payment_id
         and t.status = 'posted'
     ) then
    raise exception 'Allocated or reversed payments cannot be voided. Use a reversal transaction instead.';
  end if;

  update public.customer_project_payment_transactions
  set status = 'voided',
      voided_at = now(),
      voided_by = auth.uid(),
      void_reason = btrim(p_reason)
  where id = p_payment_id;

  return 'voided';
end;
$function$;

revoke all on table public.customer_project_payment_requirements from anon, authenticated;
revoke all on table public.customer_project_payment_transactions from anon, authenticated;
revoke all on table public.customer_project_payment_allocations from anon, authenticated;

grant select, insert, update, delete on table public.customer_project_payment_requirements to service_role;
grant select, insert, update, delete on table public.customer_project_payment_transactions to service_role;
grant select, insert, update, delete on table public.customer_project_payment_allocations to service_role;

revoke execute on function public.get_customer_project_payment_ledger(uuid) from public, anon;
revoke execute on function public.get_customer_project_payment_status(uuid) from public, anon;
revoke execute on function public.create_customer_project_payment_requirement(uuid, text, numeric, text, date, text, uuid) from public, anon;
revoke execute on function public.record_customer_project_payment(uuid, numeric, text, date, uuid, text, text) from public, anon;
revoke execute on function public.allocate_customer_project_payment(uuid, uuid, numeric) from public, anon;
revoke execute on function public.reverse_customer_project_payment(uuid, numeric, text) from public, anon;
revoke execute on function public.void_customer_project_payment(uuid, text) from public, anon;

grant execute on function public.get_customer_project_payment_ledger(uuid) to authenticated, service_role;
grant execute on function public.get_customer_project_payment_status(uuid) to authenticated, service_role;
grant execute on function public.create_customer_project_payment_requirement(uuid, text, numeric, text, date, text, uuid) to authenticated, service_role;
grant execute on function public.record_customer_project_payment(uuid, numeric, text, date, uuid, text, text) to authenticated, service_role;
grant execute on function public.allocate_customer_project_payment(uuid, uuid, numeric) to authenticated, service_role;
grant execute on function public.reverse_customer_project_payment(uuid, numeric, text) to authenticated, service_role;
grant execute on function public.void_customer_project_payment(uuid, text) to authenticated, service_role;

-- SECURITY INVOKER public wrappers require the invoker to retain EXECUTE on the
-- private role-guarded entrypoint. Internal helpers stay inaccessible.
grant execute on function private.get_customer_project_payment_ledger(uuid) to authenticated, service_role;
grant execute on function private.get_customer_project_payment_status(uuid) to authenticated, service_role;
grant execute on function private.create_customer_project_payment_requirement(uuid, text, numeric, text, date, text, uuid) to authenticated, service_role;
grant execute on function private.record_customer_project_payment(uuid, numeric, text, date, uuid, text, text) to authenticated, service_role;
grant execute on function private.allocate_customer_project_payment(uuid, uuid, numeric) to authenticated, service_role;
grant execute on function private.reverse_customer_project_payment(uuid, numeric, text) to authenticated, service_role;
grant execute on function private.void_customer_project_payment(uuid, text) to authenticated, service_role;

revoke execute on function private.project_payment_sign(text) from public, anon, authenticated;
revoke execute on function private.guard_posted_project_payment_transaction() from public, anon, authenticated;
revoke execute on function private.set_project_payment_requirement_metadata() from public, anon, authenticated;
revoke execute on function private.set_project_payment_transaction_currency() from public, anon, authenticated;
revoke execute on function private.sync_customer_invoice_payment_from_ledger(uuid) from public, anon, authenticated;
revoke execute on function private.validate_project_payment_requirement_invoice() from public, anon, authenticated;
revoke execute on function private.sync_invoice_after_payment_requirement_change() from public, anon, authenticated;
revoke execute on function private.validate_project_payment_allocation() from public, anon, authenticated;
revoke execute on function private.sync_invoice_after_payment_allocation_change() from public, anon, authenticated;

comment on table public.customer_project_payment_requirements is
  'Project receivable milestones/requirements. Payment status is derived from signed allocations.';
comment on table public.customer_project_payment_transactions is
  'Append-safe customer cash transactions for a Project. Posted amounts are corrected by reversal/refund, not destructive edits.';
comment on table public.customer_project_payment_allocations is
  'Allocation bridge between actual Project customer payments and expected payment requirements.';
