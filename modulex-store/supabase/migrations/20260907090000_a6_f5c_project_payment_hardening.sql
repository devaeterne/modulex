-- A6-F5C: close legacy destructive Project-payment compatibility paths.
-- Posted/voided transaction and allocation history is append-safe; corrections use void/reversal.

create or replace function private.guard_posted_project_payment_transaction()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if tg_op = 'DELETE' then
    if old.status in ('posted', 'voided') then
      raise exception using errcode = '23514', message = 'Posted or voided Project payment history is immutable. Use void/reversal correction semantics instead.';
    end if;
    return old;
  end if;

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

drop trigger if exists trg_guard_posted_project_payment_transaction on public.customer_project_payment_transactions;
create trigger trg_guard_posted_project_payment_transaction
before update or delete on public.customer_project_payment_transactions
for each row execute function private.guard_posted_project_payment_transaction();

create or replace function private.guard_posted_project_payment_allocation()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_status text;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    select t.status
    into v_status
    from public.customer_project_payment_transactions t
    where t.id = old.transaction_id;

    if v_status in ('posted', 'voided') then
      raise exception using errcode = '23514', message = 'Posted or voided Project payment allocations are immutable. Use void/reversal correction semantics instead.';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_guard_posted_project_payment_allocation on public.customer_project_payment_allocations;
create trigger trg_guard_posted_project_payment_allocation
before update or delete on public.customer_project_payment_allocations
for each row execute function private.guard_posted_project_payment_allocation();

create or replace function private.update_customer_project_payment(
  p_payment_id uuid,
  p_amount numeric,
  p_currency_code text,
  p_transaction_date date,
  p_payment_method_id uuid default null,
  p_reference_no text default null,
  p_notes text default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null
     or not private.current_user_has_any_role(array['super_admin','admin','finance']::text[]) then
    raise exception 'You do not have permission to update Project customer payments.' using errcode = '42501';
  end if;

  raise exception using errcode = '23514', message = 'Posted Project payment history is immutable. Use void/reversal correction semantics instead.';
end;
$function$;

create or replace function private.delete_customer_project_payment(
  p_payment_id uuid,
  p_reason text
)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null
     or not private.current_user_has_any_role(array['super_admin','admin','finance']::text[]) then
    raise exception 'You do not have permission to delete Project customer payments.' using errcode = '42501';
  end if;

  raise exception using errcode = '23514', message = 'Posted Project payment history is immutable. Use void/reversal correction semantics instead.';
end;
$function$;

create or replace function private.delete_customer_project_payment_requirement(
  p_requirement_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_requirement public.customer_project_payment_requirements%rowtype;
  v_allocations jsonb := '[]'::jsonb;
begin
  if auth.uid() is null
     or not private.current_user_has_any_role(array['super_admin','admin','finance']::text[]) then
    raise exception 'You do not have permission to delete Project Payment Plans.' using errcode = '42501';
  end if;

  select * into v_requirement
  from public.customer_project_payment_requirements
  where id = p_requirement_id
  for update;

  if v_requirement.id is null then
    raise exception 'Payment Plan not found.';
  end if;

  if exists (
    select 1
    from public.customer_project_payment_allocations a
    join public.customer_project_payment_transactions t on t.id = a.transaction_id
    where a.requirement_id = p_requirement_id
      and t.status in ('posted', 'voided')
  ) then
    raise exception using errcode = '23514', message = 'Payment Plans with posted payment history are immutable. Keep the plan and use void/reversal correction semantics instead.';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'allocation_id', a.id,
        'transaction_id', a.transaction_id,
        'amount', a.amount,
        'transaction_type', t.transaction_type,
        'transaction_status', t.status,
        'transaction_date', t.transaction_date,
        'currency_code', t.currency_code,
        'reference_no', t.reference_no,
        'created_by', a.created_by,
        'created_at', a.created_at
      ) order by a.created_at, a.id
    ),
    '[]'::jsonb
  )
  into v_allocations
  from public.customer_project_payment_allocations a
  join public.customer_project_payment_transactions t on t.id = a.transaction_id
  where a.requirement_id = p_requirement_id;

  insert into public.customer_project_payment_requirement_audit_log (
    project_id,
    requirement_id,
    action_type,
    before_snapshot,
    allocation_snapshot,
    actor_id
  ) values (
    v_requirement.project_id,
    v_requirement.id,
    'delete',
    to_jsonb(v_requirement),
    v_allocations,
    auth.uid()
  );

  delete from public.customer_project_payment_allocations
  where requirement_id = p_requirement_id;

  delete from public.customer_project_payment_requirements
  where id = p_requirement_id;

  if v_requirement.invoice_id is not null then
    perform private.sync_customer_invoice_payment_from_ledger(v_requirement.invoice_id);
  end if;

  return 'deleted';
end;
$function$;

revoke execute on function private.guard_posted_project_payment_transaction() from public, anon, authenticated;
revoke execute on function private.guard_posted_project_payment_allocation() from public, anon, authenticated;

comment on function private.update_customer_project_payment(uuid, numeric, text, date, uuid, text, text, text) is
  'F5C compatibility stub. Posted Project payment history is immutable; corrections use void/reversal.';
comment on function private.delete_customer_project_payment(uuid, text) is
  'F5C compatibility stub. Posted Project payment history cannot be hard-deleted.';
comment on function private.delete_customer_project_payment_requirement(uuid) is
  'Deletes only Payment Plans with no posted/voided allocation history; historical allocations remain immutable.';
