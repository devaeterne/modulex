-- Project Finance simplification: one-step plan payment + auditable plan hard-delete.
-- Detailed ledger model remains canonical; this migration only adds safer convenience RPCs.

create table if not exists public.customer_project_payment_requirement_audit_log (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.customer_projects(id) on update cascade on delete restrict,
  requirement_id uuid not null,
  action_type text not null default 'delete',
  before_snapshot jsonb not null,
  allocation_snapshot jsonb not null default '[]'::jsonb,
  actor_id uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint customer_project_payment_requirement_audit_action_valid check (action_type = 'delete')
);

create index if not exists customer_project_payment_requirement_audit_project_idx
  on public.customer_project_payment_requirement_audit_log(project_id, created_at desc);
create index if not exists customer_project_payment_requirement_audit_requirement_idx
  on public.customer_project_payment_requirement_audit_log(requirement_id, created_at desc);
create index if not exists customer_project_payment_requirement_audit_actor_idx
  on public.customer_project_payment_requirement_audit_log(actor_id)
  where actor_id is not null;

alter table public.customer_project_payment_requirement_audit_log enable row level security;

drop policy if exists deny_direct_customer_project_payment_requirement_audit on public.customer_project_payment_requirement_audit_log;
create policy deny_direct_customer_project_payment_requirement_audit
on public.customer_project_payment_requirement_audit_log
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

create or replace function private.guard_customer_project_payment_requirement_audit_log()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  raise exception using errcode = '23514', message = 'Project payment requirement audit rows are immutable.';
end;
$function$;

drop trigger if exists trg_guard_customer_project_payment_requirement_audit_log
  on public.customer_project_payment_requirement_audit_log;
create trigger trg_guard_customer_project_payment_requirement_audit_log
before update or delete on public.customer_project_payment_requirement_audit_log
for each row execute function private.guard_customer_project_payment_requirement_audit_log();

create or replace function private.record_and_allocate_customer_project_payment(
  p_requirement_id uuid,
  p_amount numeric,
  p_transaction_date date default current_date,
  p_payment_method_id uuid default null,
  p_reference_no text default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_requirement public.customer_project_payment_requirements%rowtype;
  v_received numeric(18,4) := 0;
  v_remaining numeric(18,4) := 0;
  v_payment_id uuid;
begin
  if auth.uid() is null
     or not private.current_user_has_any_role(array['super_admin','admin','finance']::text[]) then
    raise exception 'You do not have permission to record Project customer payments.' using errcode = '42501';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero.';
  end if;

  select * into v_requirement
  from public.customer_project_payment_requirements
  where id = p_requirement_id
  for update;

  if v_requirement.id is null then
    raise exception 'Payment Plan not found.';
  end if;

  if v_requirement.cancelled_at is not null then
    raise exception 'Cancelled Payment Plans cannot receive payments.';
  end if;

  select coalesce(sum(private.project_payment_sign(t.transaction_type) * a.amount), 0::numeric)
  into v_received
  from public.customer_project_payment_allocations a
  join public.customer_project_payment_transactions t on t.id = a.transaction_id
  where a.requirement_id = p_requirement_id
    and t.status = 'posted';

  v_remaining := greatest(v_requirement.amount - v_received, 0::numeric);

  if p_amount > v_remaining then
    raise exception using errcode = '23514', message = 'Payment amount exceeds the remaining Payment Plan balance.';
  end if;

  v_payment_id := private.record_customer_project_payment(
    v_requirement.project_id,
    p_amount,
    v_requirement.currency_code,
    coalesce(p_transaction_date, current_date),
    p_payment_method_id,
    p_reference_no,
    p_notes
  );

  perform private.allocate_customer_project_payment(
    v_payment_id,
    p_requirement_id,
    p_amount
  );

  return v_payment_id;
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

  -- Payments remain canonical cash transactions. Only their allocations to this plan are released.
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

create or replace function public.record_and_allocate_customer_project_payment(
  p_requirement_id uuid,
  p_amount numeric,
  p_transaction_date date default current_date,
  p_payment_method_id uuid default null,
  p_reference_no text default null,
  p_notes text default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $function$
  select private.record_and_allocate_customer_project_payment(
    p_requirement_id,
    p_amount,
    p_transaction_date,
    p_payment_method_id,
    p_reference_no,
    p_notes
  );
$function$;

create or replace function public.delete_customer_project_payment_requirement(
  p_requirement_id uuid
)
returns text
language sql
security invoker
set search_path = ''
as $function$
  select private.delete_customer_project_payment_requirement(p_requirement_id);
$function$;

revoke all on table public.customer_project_payment_requirement_audit_log from public, anon, authenticated;
grant select on table public.customer_project_payment_requirement_audit_log to service_role;

revoke all on function private.guard_customer_project_payment_requirement_audit_log() from public, anon, authenticated;
revoke all on function private.record_and_allocate_customer_project_payment(uuid, numeric, date, uuid, text, text) from public, anon;
revoke all on function private.delete_customer_project_payment_requirement(uuid) from public, anon;
grant execute on function private.record_and_allocate_customer_project_payment(uuid, numeric, date, uuid, text, text) to authenticated, service_role;
grant execute on function private.delete_customer_project_payment_requirement(uuid) to authenticated, service_role;

revoke all on function public.record_and_allocate_customer_project_payment(uuid, numeric, date, uuid, text, text) from public, anon;
revoke all on function public.delete_customer_project_payment_requirement(uuid) from public, anon;
grant execute on function public.record_and_allocate_customer_project_payment(uuid, numeric, date, uuid, text, text) to authenticated, service_role;
grant execute on function public.delete_customer_project_payment_requirement(uuid) to authenticated, service_role;
