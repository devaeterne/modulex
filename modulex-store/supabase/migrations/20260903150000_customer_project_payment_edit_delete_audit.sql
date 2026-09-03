-- PB-3A follow-up: controlled customer payment edits and hard deletes with immutable audit.
-- Canonical ledger rows may be removed/replaced only through role-guarded RPCs.
-- Deleted payment/allocation snapshots remain in an immutable audit log.

create table if not exists public.customer_project_payment_audit_log (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.customer_projects(id) on update cascade on delete restrict,
  customer_id uuid not null references public.customers(id) on update cascade on delete restrict,
  payment_id uuid not null,
  action_type text not null,
  before_snapshot jsonb not null,
  after_snapshot jsonb null,
  allocation_snapshot jsonb not null default '[]'::jsonb,
  reason text null,
  actor_id uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint customer_project_payment_audit_log_action_valid check (action_type in ('update', 'delete'))
);

create index if not exists customer_project_payment_audit_log_project_idx
  on public.customer_project_payment_audit_log(project_id, created_at desc);
create index if not exists customer_project_payment_audit_log_customer_idx
  on public.customer_project_payment_audit_log(customer_id, created_at desc);
create index if not exists customer_project_payment_audit_log_actor_idx
  on public.customer_project_payment_audit_log(actor_id)
  where actor_id is not null;
create index if not exists customer_project_payment_audit_log_payment_idx
  on public.customer_project_payment_audit_log(payment_id, created_at desc);

alter table public.customer_project_payment_audit_log enable row level security;

drop policy if exists deny_direct_customer_project_payment_audit_log on public.customer_project_payment_audit_log;
create policy deny_direct_customer_project_payment_audit_log
on public.customer_project_payment_audit_log
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

create or replace function private.guard_customer_project_payment_audit_log()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  raise exception using errcode = '23514', message = 'Project payment audit rows are immutable.';
end;
$function$;

drop trigger if exists trg_guard_customer_project_payment_audit_log on public.customer_project_payment_audit_log;
create trigger trg_guard_customer_project_payment_audit_log
before update or delete on public.customer_project_payment_audit_log
for each row execute function private.guard_customer_project_payment_audit_log();

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
declare
  v_payment public.customer_project_payment_transactions%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_allocations jsonb := '[]'::jsonb;
  v_invoice_ids uuid[] := '{}'::uuid[];
  v_invoice_id uuid;
  v_financial_change boolean;
begin
  if auth.uid() is null
     or not private.current_user_has_any_role(array['super_admin','admin','finance']::text[]) then
    raise exception 'You do not have permission to update Project customer payments.' using errcode = '42501';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero.';
  end if;

  if p_currency_code is null or length(btrim(p_currency_code)) <> 3 then
    raise exception 'Payment currency must be a three-letter currency code.';
  end if;

  if p_transaction_date is null then
    raise exception 'Transaction date is required.';
  end if;

  select * into v_payment
  from public.customer_project_payment_transactions
  where id = p_payment_id
  for update;

  if v_payment.id is null
     or v_payment.transaction_type <> 'payment'
     or v_payment.status <> 'posted' then
    raise exception 'Only a posted original customer payment can be edited.';
  end if;

  if exists (
    select 1
    from public.customer_project_payment_transactions t
    where t.reversal_of_transaction_id = p_payment_id
  ) then
    raise exception 'Payments with reversal/refund history cannot be edited. Record a new correction instead.';
  end if;

  v_before := to_jsonb(v_payment);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', a.id,
        'requirement_id', a.requirement_id,
        'requirement_name', r.name,
        'amount', a.amount,
        'created_by', a.created_by,
        'created_at', a.created_at
      ) order by a.created_at, a.id
    ),
    '[]'::jsonb
  )
  into v_allocations
  from public.customer_project_payment_allocations a
  join public.customer_project_payment_requirements r on r.id = a.requirement_id
  where a.transaction_id = p_payment_id;

  select coalesce(array_agg(distinct r.invoice_id) filter (where r.invoice_id is not null), '{}'::uuid[])
  into v_invoice_ids
  from public.customer_project_payment_allocations a
  join public.customer_project_payment_requirements r on r.id = a.requirement_id
  where a.transaction_id = p_payment_id;

  v_financial_change :=
    v_payment.amount is distinct from p_amount
    or upper(v_payment.currency_code) is distinct from upper(btrim(p_currency_code));

  -- Replacing the row atomically avoids weakening the existing immutable-posted trigger.
  -- Metadata-only edits restore the exact same allocation rows; amount/currency edits do not.
  delete from public.customer_project_payment_allocations
  where transaction_id = p_payment_id;

  delete from public.customer_project_payment_transactions
  where id = p_payment_id;

  insert into public.customer_project_payment_transactions (
    id,
    project_id,
    customer_id,
    transaction_type,
    status,
    amount,
    currency_code,
    transaction_date,
    payment_method_id,
    reference_no,
    reversal_of_transaction_id,
    notes,
    created_by,
    created_at,
    voided_at,
    voided_by,
    void_reason
  ) values (
    v_payment.id,
    v_payment.project_id,
    v_payment.customer_id,
    v_payment.transaction_type,
    v_payment.status,
    p_amount,
    upper(btrim(p_currency_code)),
    p_transaction_date,
    p_payment_method_id,
    nullif(btrim(coalesce(p_reference_no, '')), ''),
    v_payment.reversal_of_transaction_id,
    nullif(btrim(coalesce(p_notes, '')), ''),
    v_payment.created_by,
    v_payment.created_at,
    v_payment.voided_at,
    v_payment.voided_by,
    v_payment.void_reason
  );

  if not v_financial_change then
    insert into public.customer_project_payment_allocations (
      id,
      transaction_id,
      requirement_id,
      amount,
      created_by,
      created_at
    )
    select
      (item->>'id')::uuid,
      p_payment_id,
      (item->>'requirement_id')::uuid,
      (item->>'amount')::numeric,
      nullif(item->>'created_by', '')::uuid,
      (item->>'created_at')::timestamptz
    from jsonb_array_elements(v_allocations) item;
  end if;

  select to_jsonb(t) into v_after
  from public.customer_project_payment_transactions t
  where t.id = p_payment_id;

  insert into public.customer_project_payment_audit_log (
    project_id,
    customer_id,
    payment_id,
    action_type,
    before_snapshot,
    after_snapshot,
    allocation_snapshot,
    reason,
    actor_id
  ) values (
    v_payment.project_id,
    v_payment.customer_id,
    p_payment_id,
    'update',
    v_before,
    v_after,
    v_allocations,
    nullif(btrim(coalesce(p_reason, '')), ''),
    auth.uid()
  );

  foreach v_invoice_id in array v_invoice_ids loop
    perform private.sync_customer_invoice_payment_from_ledger(v_invoice_id);
  end loop;

  return jsonb_build_object('allocation_reset', v_financial_change);
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
declare
  v_payment public.customer_project_payment_transactions%rowtype;
  v_before jsonb;
  v_allocations jsonb := '[]'::jsonb;
  v_invoice_ids uuid[] := '{}'::uuid[];
  v_invoice_id uuid;
begin
  if auth.uid() is null
     or not private.current_user_has_any_role(array['super_admin','admin','finance']::text[]) then
    raise exception 'You do not have permission to delete Project customer payments.' using errcode = '42501';
  end if;

  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception 'A delete reason is required.';
  end if;

  select * into v_payment
  from public.customer_project_payment_transactions
  where id = p_payment_id
  for update;

  if v_payment.id is null
     or v_payment.transaction_type <> 'payment'
     or v_payment.status <> 'posted' then
    raise exception 'Only a posted original customer payment can be deleted.';
  end if;

  if exists (
    select 1
    from public.customer_project_payment_transactions t
    where t.reversal_of_transaction_id = p_payment_id
  ) then
    raise exception 'Payments with reversal/refund history cannot be hard-deleted. Record a new correction instead.';
  end if;

  v_before := to_jsonb(v_payment);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', a.id,
        'requirement_id', a.requirement_id,
        'requirement_name', r.name,
        'amount', a.amount,
        'created_by', a.created_by,
        'created_at', a.created_at
      ) order by a.created_at, a.id
    ),
    '[]'::jsonb
  )
  into v_allocations
  from public.customer_project_payment_allocations a
  join public.customer_project_payment_requirements r on r.id = a.requirement_id
  where a.transaction_id = p_payment_id;

  select coalesce(array_agg(distinct r.invoice_id) filter (where r.invoice_id is not null), '{}'::uuid[])
  into v_invoice_ids
  from public.customer_project_payment_allocations a
  join public.customer_project_payment_requirements r on r.id = a.requirement_id
  where a.transaction_id = p_payment_id;

  insert into public.customer_project_payment_audit_log (
    project_id,
    customer_id,
    payment_id,
    action_type,
    before_snapshot,
    after_snapshot,
    allocation_snapshot,
    reason,
    actor_id
  ) values (
    v_payment.project_id,
    v_payment.customer_id,
    p_payment_id,
    'delete',
    v_before,
    null,
    v_allocations,
    btrim(p_reason),
    auth.uid()
  );

  delete from public.customer_project_payment_allocations
  where transaction_id = p_payment_id;

  delete from public.customer_project_payment_transactions
  where id = p_payment_id;

  foreach v_invoice_id in array v_invoice_ids loop
    perform private.sync_customer_invoice_payment_from_ledger(v_invoice_id);
  end loop;

  return 'deleted';
end;
$function$;

create or replace function public.update_customer_project_payment(
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
language sql
set search_path = 'pg_catalog', 'private'
as $function$
  select private.update_customer_project_payment($1, $2, $3, $4, $5, $6, $7, $8);
$function$;

create or replace function public.delete_customer_project_payment(
  p_payment_id uuid,
  p_reason text
)
returns text
language sql
set search_path = 'pg_catalog', 'private'
as $function$
  select private.delete_customer_project_payment($1, $2);
$function$;

revoke all on table public.customer_project_payment_audit_log from public, anon, authenticated;
grant select, insert on table public.customer_project_payment_audit_log to service_role;

revoke execute on function public.update_customer_project_payment(uuid, numeric, text, date, uuid, text, text, text) from public, anon;
revoke execute on function public.delete_customer_project_payment(uuid, text) from public, anon;
grant execute on function public.update_customer_project_payment(uuid, numeric, text, date, uuid, text, text, text) to authenticated, service_role;
grant execute on function public.delete_customer_project_payment(uuid, text) to authenticated, service_role;

grant execute on function private.update_customer_project_payment(uuid, numeric, text, date, uuid, text, text, text) to authenticated, service_role;
grant execute on function private.delete_customer_project_payment(uuid, text) to authenticated, service_role;

revoke execute on function private.guard_customer_project_payment_audit_log() from public, anon, authenticated;

comment on table public.customer_project_payment_audit_log is
  'Immutable audit snapshots for controlled Project customer-payment edits and hard deletes. Deleted payment IDs are intentionally not foreign keys.';
comment on function public.update_customer_project_payment(uuid, numeric, text, date, uuid, text, text, text) is
  'Admin/Finance-only controlled edit. Amount/currency changes clear allocations; metadata-only edits preserve them.';
comment on function public.delete_customer_project_payment(uuid, text) is
  'Admin/Finance-only hard delete. Payment/allocation rows are removed from the canonical ledger after an immutable audit snapshot is stored.';
