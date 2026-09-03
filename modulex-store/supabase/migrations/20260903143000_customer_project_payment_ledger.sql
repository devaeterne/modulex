-- PB-3A: Project-first customer payment ledger.
-- Customer payments are independent from invoice issuance.

create schema if not exists private;

alter table public.customer_invoices
  add column if not exists ledger_managed boolean not null default false;

comment on column public.customer_invoices.ledger_managed is
  'When true, paid_amount is maintained by the Project payment ledger and must not be edited directly.';

create table if not exists public.customer_project_payment_requirements (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.customer_projects(id) on update cascade on delete restrict,
  invoice_id uuid null references public.customer_invoices(id) on update cascade on delete restrict,
  name text not null,
  sequence_no integer not null default 0,
  amount numeric(18,4) not null,
  currency_code varchar(3) not null,
  due_date date null,
  notes text null,
  cancelled_at timestamptz null,
  cancelled_by uuid null references public.profiles(id) on delete set null,
  created_by uuid null references public.profiles(id) on delete set null,
  updated_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_project_payment_requirements_name_not_empty check (length(btrim(name)) > 0),
  constraint customer_project_payment_requirements_amount_positive check (amount > 0),
  constraint customer_project_payment_requirements_currency_valid check (currency_code = upper(currency_code) and length(currency_code) = 3),
  constraint customer_project_payment_requirements_sequence_valid check (sequence_no >= 0)
);

create table if not exists public.customer_project_payment_transactions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.customer_projects(id) on update cascade on delete restrict,
  customer_id uuid not null references public.customers(id) on update cascade on delete restrict,
  transaction_type text not null,
  status text not null default 'posted',
  amount numeric(18,4) not null,
  currency_code varchar(3) not null,
  transaction_date date not null,
  payment_method_id uuid null references public.payment_methods(id) on update cascade on delete restrict,
  reference_no text null,
  reversal_of_transaction_id uuid null references public.customer_project_payment_transactions(id) on update cascade on delete restrict,
  notes text null,
  created_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint customer_project_payment_transactions_type_valid check (transaction_type in ('payment', 'refund', 'reversal')),
  constraint customer_project_payment_transactions_status_valid check (status in ('posted', 'voided')),
  constraint customer_project_payment_transactions_amount_positive check (amount > 0),
  constraint customer_project_payment_transactions_currency_valid check (currency_code = upper(currency_code) and length(currency_code) = 3),
  constraint customer_project_payment_transactions_reversal_shape check (
    (transaction_type = 'payment' and reversal_of_transaction_id is null)
    or (transaction_type in ('refund', 'reversal') and reversal_of_transaction_id is not null)
  )
);

create table if not exists public.customer_project_payment_allocations (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.customer_project_payment_transactions(id) on update cascade on delete restrict,
  requirement_id uuid not null references public.customer_project_payment_requirements(id) on update cascade on delete restrict,
  amount numeric(18,4) not null,
  created_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint customer_project_payment_allocations_amount_positive check (amount > 0),
  constraint customer_project_payment_allocations_unique_pair unique (transaction_id, requirement_id)
);

create index if not exists customer_project_payment_requirements_project_idx
  on public.customer_project_payment_requirements(project_id, sequence_no, created_at);
create index if not exists customer_project_payment_requirements_invoice_idx
  on public.customer_project_payment_requirements(invoice_id)
  where invoice_id is not null;
create index if not exists customer_project_payment_requirements_due_idx
  on public.customer_project_payment_requirements(project_id, due_date)
  where cancelled_at is null and due_date is not null;
create index if not exists customer_project_payment_transactions_project_idx
  on public.customer_project_payment_transactions(project_id, transaction_date desc, created_at desc);
create index if not exists customer_project_payment_transactions_customer_idx
  on public.customer_project_payment_transactions(customer_id, transaction_date desc);
create index if not exists customer_project_payment_transactions_reversal_idx
  on public.customer_project_payment_transactions(reversal_of_transaction_id)
  where reversal_of_transaction_id is not null;
create index if not exists customer_project_payment_allocations_transaction_idx
  on public.customer_project_payment_allocations(transaction_id);
create index if not exists customer_project_payment_allocations_requirement_idx
  on public.customer_project_payment_allocations(requirement_id);

alter table public.customer_project_payment_requirements enable row level security;
alter table public.customer_project_payment_transactions enable row level security;
alter table public.customer_project_payment_allocations enable row level security;

create or replace function private.project_payment_sign(p_transaction_type text)
returns numeric
language sql
immutable
set search_path = ''
as $function$
  select case when p_transaction_type = 'payment' then 1::numeric else -1::numeric end;
$function$;

create or replace function private.guard_posted_project_payment_transaction()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
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
       or new.notes is distinct from old.notes then
      raise exception using errcode = '23514', message = 'Posted Project payment transactions are immutable. Use reversal/refund for corrections.';
    end if;
  end if;

  if old.status = 'voided' and new.status <> 'voided' then
    raise exception using errcode = '23514', message = 'A voided Project payment transaction cannot be reactivated.';
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_guard_posted_project_payment_transaction on public.customer_project_payment_transactions;
create trigger trg_guard_posted_project_payment_transaction
before update on public.customer_project_payment_transactions
for each row execute function private.guard_posted_project_payment_transaction();

create or replace function private.set_project_payment_requirement_metadata()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.currency_code := upper(new.currency_code);
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$function$;

drop trigger if exists trg_set_project_payment_requirement_metadata on public.customer_project_payment_requirements;
create trigger trg_set_project_payment_requirement_metadata
before insert or update on public.customer_project_payment_requirements
for each row execute function private.set_project_payment_requirement_metadata();

create or replace function private.set_project_payment_transaction_currency()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.currency_code := upper(new.currency_code);
  return new;
end;
$function$;

drop trigger if exists trg_set_project_payment_transaction_currency on public.customer_project_payment_transactions;
create trigger trg_set_project_payment_transaction_currency
before insert on public.customer_project_payment_transactions
for each row execute function private.set_project_payment_transaction_currency();

create or replace function private.sync_customer_invoice_payment_from_ledger(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_invoice public.customer_invoices%rowtype;
  v_paid numeric(18,4) := 0;
  v_next_status text;
begin
  if p_invoice_id is null then
    return;
  end if;

  select * into v_invoice
  from public.customer_invoices
  where id = p_invoice_id
  for update;

  if v_invoice.id is null then
    raise exception 'Invoice not found.';
  end if;

  select coalesce(sum(private.project_payment_sign(t.transaction_type) * a.amount), 0::numeric)
  into v_paid
  from public.customer_project_payment_requirements r
  join public.customer_project_payment_allocations a on a.requirement_id = r.id
  join public.customer_project_payment_transactions t on t.id = a.transaction_id
  where r.invoice_id = p_invoice_id
    and r.cancelled_at is null
    and t.status = 'posted';

  v_paid := greatest(0::numeric, least(v_invoice.total_amount, v_paid));

  if v_invoice.status = 'void' then
    v_next_status := 'void';
  elsif v_invoice.issued_at is null then
    v_next_status := 'draft';
  elsif v_paid >= v_invoice.total_amount and v_invoice.total_amount > 0 then
    v_next_status := 'paid';
  elsif v_paid > 0 then
    v_next_status := 'partially_paid';
  elsif v_invoice.due_date is not null and v_invoice.due_date < current_date then
    v_next_status := 'overdue';
  else
    v_next_status := 'issued';
  end if;

  update public.customer_invoices
  set ledger_managed = true,
      paid_amount = v_paid,
      status = v_next_status,
      paid_at = case when v_next_status = 'paid' then coalesce(paid_at, now()) else null end,
      updated_at = now(),
      updated_by = coalesce(auth.uid(), updated_by)
  where id = p_invoice_id;
end;
$function$;

create or replace function private.validate_project_payment_requirement_invoice()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_project_customer_id uuid;
  v_invoice_customer_id uuid;
  v_invoice_project_id uuid;
  v_invoice_total numeric(18,4);
  v_other_requirement_total numeric(18,4);
begin
  if new.invoice_id is null then
    return new;
  end if;

  select cp.customer_id
  into v_project_customer_id
  from public.customer_projects cp
  where cp.id = new.project_id;

  select i.customer_id, o.project_id, i.total_amount
  into v_invoice_customer_id, v_invoice_project_id, v_invoice_total
  from public.customer_invoices i
  left join public.customer_orders o on o.id = i.order_id
  where i.id = new.invoice_id;

  if v_invoice_customer_id is null then
    raise exception 'Invoice not found.';
  end if;

  if v_invoice_customer_id is distinct from v_project_customer_id
     or v_invoice_project_id is distinct from new.project_id then
    raise exception using errcode = '23514', message = 'Invoice must belong to the same Project and Customer as the payment requirement.';
  end if;

  select coalesce(sum(r.amount), 0::numeric)
  into v_other_requirement_total
  from public.customer_project_payment_requirements r
  where r.invoice_id = new.invoice_id
    and r.cancelled_at is null
    and r.id is distinct from new.id;

  if v_other_requirement_total + new.amount > v_invoice_total then
    raise exception using errcode = '23514', message = 'Active payment requirements linked to an Invoice cannot exceed the Invoice total.';
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_validate_project_payment_requirement_invoice on public.customer_project_payment_requirements;
create trigger trg_validate_project_payment_requirement_invoice
before insert or update of project_id, invoice_id, amount, cancelled_at on public.customer_project_payment_requirements
for each row execute function private.validate_project_payment_requirement_invoice();

create or replace function private.sync_invoice_after_payment_requirement_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op = 'UPDATE' and old.invoice_id is not null and old.invoice_id is distinct from new.invoice_id then
    perform private.sync_customer_invoice_payment_from_ledger(old.invoice_id);
  end if;

  if new.invoice_id is not null then
    perform private.sync_customer_invoice_payment_from_ledger(new.invoice_id);
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_sync_invoice_after_payment_requirement_change on public.customer_project_payment_requirements;
create trigger trg_sync_invoice_after_payment_requirement_change
after insert or update on public.customer_project_payment_requirements
for each row execute function private.sync_invoice_after_payment_requirement_change();

create or replace function private.validate_project_payment_allocation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_transaction public.customer_project_payment_transactions%rowtype;
  v_requirement public.customer_project_payment_requirements%rowtype;
  v_transaction_allocated numeric(18,4);
  v_requirement_received numeric(18,4);
begin
  select * into v_transaction
  from public.customer_project_payment_transactions
  where id = new.transaction_id
  for update;

  select * into v_requirement
  from public.customer_project_payment_requirements
  where id = new.requirement_id
  for update;

  if v_transaction.id is null or v_requirement.id is null then
    raise exception 'Payment transaction or requirement not found.';
  end if;

  if v_transaction.status <> 'posted' then
    raise exception using errcode = '23514', message = 'Only posted Project payment transactions can be allocated.';
  end if;

  if v_requirement.cancelled_at is not null then
    raise exception using errcode = '23514', message = 'Cancelled payment requirements cannot receive allocations.';
  end if;

  if v_transaction.project_id is distinct from v_requirement.project_id
     or upper(v_transaction.currency_code) is distinct from upper(v_requirement.currency_code) then
    raise exception using errcode = '23514', message = 'Payment and requirement must belong to the same Project and currency.';
  end if;

  select coalesce(sum(a.amount), 0::numeric)
  into v_transaction_allocated
  from public.customer_project_payment_allocations a
  where a.transaction_id = new.transaction_id
    and a.id is distinct from new.id;

  if v_transaction_allocated + new.amount > v_transaction.amount then
    raise exception using errcode = '23514', message = 'Payment allocation exceeds transaction amount.';
  end if;

  select coalesce(sum(private.project_payment_sign(t.transaction_type) * a.amount), 0::numeric)
  into v_requirement_received
  from public.customer_project_payment_allocations a
  join public.customer_project_payment_transactions t on t.id = a.transaction_id
  where a.requirement_id = new.requirement_id
    and a.id is distinct from new.id
    and t.status = 'posted';

  if v_transaction.transaction_type = 'payment'
     and v_requirement_received + new.amount > v_requirement.amount then
    raise exception using errcode = '23514', message = 'Payment allocation exceeds remaining requirement amount.';
  end if;

  if v_transaction.transaction_type in ('refund', 'reversal')
     and v_requirement_received - new.amount < 0 then
    raise exception using errcode = '23514', message = 'Refund/reversal allocation exceeds the amount previously received for the requirement.';
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_validate_project_payment_allocation on public.customer_project_payment_allocations;
create trigger trg_validate_project_payment_allocation
before insert or update on public.customer_project_payment_allocations
for each row execute function private.validate_project_payment_allocation();

create or replace function private.sync_invoice_after_payment_allocation_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_invoice_id uuid;
begin
  select r.invoice_id into v_invoice_id
  from public.customer_project_payment_requirements r
  where r.id = coalesce(new.requirement_id, old.requirement_id);

  if v_invoice_id is not null then
    perform private.sync_customer_invoice_payment_from_ledger(v_invoice_id);
  end if;

  return coalesce(new, old);
end;
$function$;

drop trigger if exists trg_sync_invoice_after_payment_allocation_change on public.customer_project_payment_allocations;
create trigger trg_sync_invoice_after_payment_allocation_change
after insert or update on public.customer_project_payment_allocations
for each row execute function private.sync_invoice_after_payment_allocation_change();

create or replace function private.create_customer_project_payment_requirement(
  p_project_id uuid,
  p_name text,
  p_amount numeric,
  p_currency_code text,
  p_due_date date default null,
  p_notes text default null,
  p_invoice_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_id uuid;
  v_next_sequence integer;
begin
  if auth.uid() is null
     or not private.current_user_has_any_role(array['super_admin','admin','finance']::text[]) then
    raise exception 'You do not have permission to manage Project customer payments.' using errcode = '42501';
  end if;

  if p_project_id is null or not exists (
    select 1 from public.customer_projects cp where cp.id = p_project_id
  ) then
    raise exception 'Project not found.';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Requirement amount must be greater than zero.';
  end if;

  if p_currency_code is null or length(btrim(p_currency_code)) <> 3 then
    raise exception 'Currency code must contain three letters.';
  end if;

  select coalesce(max(r.sequence_no), 0) + 1
  into v_next_sequence
  from public.customer_project_payment_requirements r
  where r.project_id = p_project_id;

  insert into public.customer_project_payment_requirements (
    project_id, invoice_id, name, sequence_no, amount, currency_code, due_date, notes, created_by, updated_by
  ) values (
    p_project_id, p_invoice_id, btrim(p_name), v_next_sequence, p_amount, upper(btrim(p_currency_code)), p_due_date, nullif(btrim(p_notes), ''), auth.uid(), auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$function$;

create or replace function private.record_customer_project_payment(
  p_project_id uuid,
  p_amount numeric,
  p_currency_code text,
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
  v_id uuid;
  v_customer_id uuid;
begin
  if auth.uid() is null
     or not private.current_user_has_any_role(array['super_admin','admin','finance']::text[]) then
    raise exception 'You do not have permission to record Project customer payments.' using errcode = '42501';
  end if;

  select cp.customer_id into v_customer_id
  from public.customer_projects cp
  where cp.id = p_project_id;

  if v_customer_id is null then
    raise exception 'Project not found.';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero.';
  end if;

  if p_currency_code is null or length(btrim(p_currency_code)) <> 3 then
    raise exception 'Currency code must contain three letters.';
  end if;

  if p_payment_method_id is not null and not exists (
    select 1 from public.payment_methods pm where pm.id = p_payment_method_id and pm.is_active
  ) then
    raise exception 'Payment method is not active.';
  end if;

  insert into public.customer_project_payment_transactions (
    project_id, customer_id, transaction_type, status, amount, currency_code,
    transaction_date, payment_method_id, reference_no, notes, created_by
  ) values (
    p_project_id, v_customer_id, 'payment', 'posted', p_amount, upper(btrim(p_currency_code)),
    coalesce(p_transaction_date, current_date), p_payment_method_id, nullif(btrim(p_reference_no), ''), nullif(btrim(p_notes), ''), auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$function$;

create or replace function private.allocate_customer_project_payment(
  p_payment_id uuid,
  p_requirement_id uuid,
  p_amount numeric
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_id uuid;
  v_transaction_type text;
begin
  if auth.uid() is null
     or not private.current_user_has_any_role(array['super_admin','admin','finance']::text[]) then
    raise exception 'You do not have permission to allocate Project customer payments.' using errcode = '42501';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Allocation amount must be greater than zero.';
  end if;

  select t.transaction_type into v_transaction_type
  from public.customer_project_payment_transactions t
  where t.id = p_payment_id;

  if v_transaction_type is null then
    raise exception 'Payment transaction not found.';
  end if;

  if v_transaction_type <> 'payment' then
    raise exception 'Manual allocation is only supported for customer payment transactions.';
  end if;

  insert into public.customer_project_payment_allocations (
    transaction_id, requirement_id, amount, created_by
  ) values (
    p_payment_id, p_requirement_id, p_amount, auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$function$;

create or replace function private.reverse_customer_project_payment(
  p_payment_id uuid,
  p_amount numeric,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_original public.customer_project_payment_transactions%rowtype;
  v_reversal_id uuid;
  v_reversed_total numeric(18,4);
  v_original_allocated numeric(18,4);
  v_unallocated numeric(18,4);
  v_remaining_to_allocate numeric(18,4);
  v_available numeric(18,4);
  v_take numeric(18,4);
  v_row record;
begin
  if auth.uid() is null
     or not private.current_user_has_any_role(array['super_admin','admin','finance']::text[]) then
    raise exception 'You do not have permission to reverse Project customer payments.' using errcode = '42501';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Reversal amount must be greater than zero.';
  end if;

  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception 'A reversal reason is required.';
  end if;

  select * into v_original
  from public.customer_project_payment_transactions
  where id = p_payment_id
  for update;

  if v_original.id is null or v_original.transaction_type <> 'payment' or v_original.status <> 'posted' then
    raise exception 'Only a posted customer payment can be reversed.';
  end if;

  select coalesce(sum(t.amount), 0::numeric)
  into v_reversed_total
  from public.customer_project_payment_transactions t
  where t.reversal_of_transaction_id = v_original.id
    and t.transaction_type in ('refund', 'reversal')
    and t.status = 'posted';

  if v_reversed_total + p_amount > v_original.amount then
    raise exception 'Reversal amount exceeds the remaining reversible payment amount.';
  end if;

  select coalesce(sum(a.amount), 0::numeric)
  into v_original_allocated
  from public.customer_project_payment_allocations a
  where a.transaction_id = v_original.id;

  v_unallocated := greatest(v_original.amount - v_original_allocated - v_reversed_total, 0::numeric);
  v_remaining_to_allocate := greatest(p_amount - v_unallocated, 0::numeric);

  insert into public.customer_project_payment_transactions (
    project_id, customer_id, transaction_type, status, amount, currency_code,
    transaction_date, payment_method_id, reference_no, reversal_of_transaction_id, notes, created_by
  ) values (
    v_original.project_id, v_original.customer_id, 'reversal', 'posted', p_amount, v_original.currency_code,
    current_date, v_original.payment_method_id, v_original.reference_no, v_original.id, btrim(p_reason), auth.uid()
  )
  returning id into v_reversal_id;

  if v_remaining_to_allocate > 0 then
    for v_row in
      select
        a.requirement_id,
        a.amount - coalesce((
          select sum(ra.amount)
          from public.customer_project_payment_allocations ra
          join public.customer_project_payment_transactions rt on rt.id = ra.transaction_id
          where rt.reversal_of_transaction_id = v_original.id
            and rt.status = 'posted'
            and ra.requirement_id = a.requirement_id
        ), 0::numeric) as available_amount
      from public.customer_project_payment_allocations a
      where a.transaction_id = v_original.id
      order by a.created_at desc, a.id desc
    loop
      exit when v_remaining_to_allocate <= 0;
      v_available := greatest(v_row.available_amount, 0::numeric);
      if v_available <= 0 then
        continue;
      end if;
      v_take := least(v_available, v_remaining_to_allocate);
      insert into public.customer_project_payment_allocations (
        transaction_id, requirement_id, amount, created_by
      ) values (
        v_reversal_id, v_row.requirement_id, v_take, auth.uid()
      );
      v_remaining_to_allocate := v_remaining_to_allocate - v_take;
    end loop;
  end if;

  if v_remaining_to_allocate > 0 then
    raise exception 'Reversal could not be reconciled to the original payment allocations.';
  end if;

  return v_reversal_id;
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

  select * into v_payment
  from public.customer_project_payment_transactions
  where id = p_payment_id
  for update;

  if v_payment.id is null or v_payment.status <> 'posted' then
    raise exception 'Posted payment transaction not found.';
  end if;

  if exists (select 1 from public.customer_project_payment_allocations a where a.transaction_id = p_payment_id)
     or exists (select 1 from public.customer_project_payment_transactions t where t.reversal_of_transaction_id = p_payment_id and t.status = 'posted') then
    raise exception 'Allocated or reversed payments cannot be voided. Use a reversal transaction instead.';
  end if;

  update public.customer_project_payment_transactions
  set status = 'voided', notes = concat_ws(E'\n', nullif(notes, ''), 'VOID: ' || btrim(coalesce(p_reason, 'No reason provided')))
  where id = p_payment_id;

  return 'voided';
end;
$function$;

create or replace function private.get_customer_project_payment_ledger(p_project_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_result jsonb;
begin
  if auth.uid() is null
     or not private.current_user_has_any_role(array['super_admin','admin','finance']::text[]) then
    raise exception 'You do not have permission to view detailed Project payment data.' using errcode = '42501';
  end if;

  if p_project_id is null or not exists (
    select 1 from public.customer_projects cp where cp.id = p_project_id
  ) then
    raise exception 'Project not found.';
  end if;

  with signed_allocations as (
    select
      a.requirement_id,
      a.transaction_id,
      private.project_payment_sign(t.transaction_type) * a.amount as signed_amount
    from public.customer_project_payment_allocations a
    join public.customer_project_payment_transactions t on t.id = a.transaction_id
    where t.project_id = p_project_id
      and t.status = 'posted'
  ),
  requirement_rollup as (
    select
      r.id,
      r.name,
      r.sequence_no,
      r.amount,
      r.currency_code,
      r.due_date,
      r.invoice_id,
      r.cancelled_at,
      coalesce(sum(sa.signed_amount), 0::numeric) as received
    from public.customer_project_payment_requirements r
    left join signed_allocations sa on sa.requirement_id = r.id
    where r.project_id = p_project_id
    group by r.id
  ),
  transaction_rollup as (
    select
      t.id,
      t.transaction_type,
      t.status,
      t.amount,
      t.currency_code,
      t.transaction_date,
      t.payment_method_id,
      pm.name as payment_method_name,
      t.reference_no,
      t.reversal_of_transaction_id,
      t.notes,
      t.created_at,
      coalesce(sum(a.amount), 0::numeric) as allocated
    from public.customer_project_payment_transactions t
    left join public.customer_project_payment_allocations a on a.transaction_id = t.id
    left join public.payment_methods pm on pm.id = t.payment_method_id
    where t.project_id = p_project_id
    group by t.id, pm.name
  ),
  currency_codes as (
    select upper(r.currency_code) as currency_code
    from public.customer_project_payment_requirements r
    where r.project_id = p_project_id and r.cancelled_at is null
    union
    select upper(t.currency_code)
    from public.customer_project_payment_transactions t
    where t.project_id = p_project_id and t.status = 'posted'
  ),
  currency_rollup as (
    select
      cc.currency_code,
      coalesce((select sum(r.amount) from public.customer_project_payment_requirements r where r.project_id = p_project_id and r.cancelled_at is null and upper(r.currency_code) = cc.currency_code), 0::numeric) as expected,
      coalesce((select sum(private.project_payment_sign(t.transaction_type) * t.amount) from public.customer_project_payment_transactions t where t.project_id = p_project_id and t.status = 'posted' and upper(t.currency_code) = cc.currency_code), 0::numeric) as received,
      coalesce((select sum(sa.signed_amount) from signed_allocations sa join public.customer_project_payment_requirements r on r.id = sa.requirement_id where r.project_id = p_project_id and r.cancelled_at is null and upper(r.currency_code) = cc.currency_code), 0::numeric) as allocated,
      coalesce((select sum(greatest(r.amount - rr.received, 0::numeric)) from requirement_rollup rr join public.customer_project_payment_requirements r on r.id = rr.id where r.cancelled_at is null and upper(r.currency_code) = cc.currency_code), 0::numeric) as remaining,
      coalesce((select sum(greatest(r.amount - rr.received, 0::numeric)) from requirement_rollup rr join public.customer_project_payment_requirements r on r.id = rr.id where r.cancelled_at is null and r.due_date is not null and r.due_date < current_date and rr.received < r.amount and upper(r.currency_code) = cc.currency_code), 0::numeric) as overdue
    from currency_codes cc
  )
  select jsonb_build_object(
    'project_id', p_project_id,
    'currencies', coalesce((
      select jsonb_agg(jsonb_build_object(
        'currency_code', cr.currency_code,
        'expected', round(cr.expected, 2),
        'received', round(cr.received, 2),
        'allocated', round(cr.allocated, 2),
        'unallocated_credit', round(cr.received - cr.allocated, 2),
        'remaining', round(cr.remaining, 2),
        'overdue', round(cr.overdue, 2)
      ) order by cr.currency_code)
      from currency_rollup cr
    ), '[]'::jsonb),
    'requirements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', rr.id,
        'name', rr.name,
        'sequence_no', rr.sequence_no,
        'amount', round(rr.amount, 2),
        'received', round(rr.received, 2),
        'remaining', round(greatest(rr.amount - rr.received, 0::numeric), 2),
        'currency_code', rr.currency_code,
        'due_date', rr.due_date,
        'invoice_id', rr.invoice_id,
        'status', case
          when rr.cancelled_at is not null then 'cancelled'
          when rr.due_date is not null and rr.due_date < current_date and rr.received < rr.amount then 'overdue'
          when rr.received >= rr.amount then 'paid'
          when rr.received > 0 then 'partially_paid'
          else 'pending'
        end
      ) order by rr.sequence_no, rr.id)
      from requirement_rollup rr
    ), '[]'::jsonb),
    'transactions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', tr.id,
        'transaction_type', tr.transaction_type,
        'status', tr.status,
        'amount', round(tr.amount, 2),
        'allocated', round(tr.allocated, 2),
        'unallocated', round(tr.amount - tr.allocated, 2),
        'currency_code', tr.currency_code,
        'transaction_date', tr.transaction_date,
        'payment_method_id', tr.payment_method_id,
        'payment_method_name', tr.payment_method_name,
        'reference_no', tr.reference_no,
        'reversal_of_transaction_id', tr.reversal_of_transaction_id,
        'notes', tr.notes,
        'created_at', tr.created_at
      ) order by tr.transaction_date desc, tr.created_at desc)
      from transaction_rollup tr
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$function$;

create or replace function private.get_customer_project_payment_status(p_project_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_result jsonb;
begin
  if auth.uid() is null
     or not private.current_user_has_any_role(array['super_admin','admin','finance','sales']::text[]) then
    raise exception 'You do not have permission to view Project payment status.' using errcode = '42501';
  end if;

  if p_project_id is null or not exists (
    select 1 from public.customer_projects cp where cp.id = p_project_id
  ) then
    raise exception 'Project not found.';
  end if;

  with requirement_state as (
    select
      r.id,
      r.name,
      r.sequence_no,
      r.due_date,
      r.cancelled_at,
      r.amount,
      coalesce(sum(case when t.status = 'posted' then private.project_payment_sign(t.transaction_type) * a.amount else 0::numeric end), 0::numeric) as received
    from public.customer_project_payment_requirements r
    left join public.customer_project_payment_allocations a on a.requirement_id = r.id
    left join public.customer_project_payment_transactions t on t.id = a.transaction_id
    where r.project_id = p_project_id
    group by r.id
  ),
  states as (
    select
      rs.id,
      rs.name,
      rs.sequence_no,
      rs.due_date,
      case
        when rs.cancelled_at is not null then 'cancelled'
        when rs.due_date is not null and rs.due_date < current_date and rs.received < rs.amount then 'overdue'
        when rs.received >= rs.amount then 'received'
        when rs.received > 0 then 'partially_received'
        else 'not_received'
      end as payment_state
    from requirement_state rs
  )
  select jsonb_build_object(
    'project_id', p_project_id,
    'overall_status', case
      when not exists (select 1 from states s where s.payment_state <> 'cancelled') then 'not_received'
      when exists (select 1 from states s where s.payment_state = 'overdue') then 'overdue'
      when not exists (select 1 from states s where s.payment_state not in ('received','cancelled')) then 'received'
      when exists (select 1 from states s where s.payment_state in ('received','partially_received')) then 'partially_received'
      else 'not_received'
    end,
    'requirements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'name', s.name,
        'due_date', s.due_date,
        'status', s.payment_state
      ) order by s.sequence_no, s.id)
      from states s
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$function$;

create or replace function public.get_customer_project_payment_ledger(p_project_id uuid)
returns jsonb
language sql
stable
set search_path = 'pg_catalog', 'private'
as $function$
  select private.get_customer_project_payment_ledger($1);
$function$;

create or replace function public.get_customer_project_payment_status(p_project_id uuid)
returns jsonb
language sql
stable
set search_path = 'pg_catalog', 'private'
as $function$
  select private.get_customer_project_payment_status($1);
$function$;

create or replace function public.create_customer_project_payment_requirement(
  p_project_id uuid,
  p_name text,
  p_amount numeric,
  p_currency_code text,
  p_due_date date default null,
  p_notes text default null,
  p_invoice_id uuid default null
)
returns uuid
language sql
set search_path = 'pg_catalog', 'private'
as $function$
  select private.create_customer_project_payment_requirement($1, $2, $3, $4, $5, $6, $7);
$function$;

create or replace function public.record_customer_project_payment(
  p_project_id uuid,
  p_amount numeric,
  p_currency_code text,
  p_transaction_date date default current_date,
  p_payment_method_id uuid default null,
  p_reference_no text default null,
  p_notes text default null
)
returns uuid
language sql
set search_path = 'pg_catalog', 'private'
as $function$
  select private.record_customer_project_payment($1, $2, $3, $4, $5, $6, $7);
$function$;

create or replace function public.allocate_customer_project_payment(
  p_payment_id uuid,
  p_requirement_id uuid,
  p_amount numeric
)
returns uuid
language sql
set search_path = 'pg_catalog', 'private'
as $function$
  select private.allocate_customer_project_payment($1, $2, $3);
$function$;

create or replace function public.reverse_customer_project_payment(
  p_payment_id uuid,
  p_amount numeric,
  p_reason text
)
returns uuid
language sql
set search_path = 'pg_catalog', 'private'
as $function$
  select private.reverse_customer_project_payment($1, $2, $3);
$function$;

create or replace function public.void_customer_project_payment(
  p_payment_id uuid,
  p_reason text
)
returns text
language sql
set search_path = 'pg_catalog', 'private'
as $function$
  select private.void_customer_project_payment($1, $2);
$function$;

-- Ledger-managed invoices cannot accept direct paid_amount edits or direct payment-derived statuses.
create or replace function private.update_customer_invoice_state_core(
  p_invoice_id uuid,
  p_status text default null,
  p_paid_amount numeric default null
)
returns text
language plpgsql
set search_path to 'public'
as $function$
declare
  v_invoice public.customer_invoices%rowtype;
  v_status text;
  v_paid numeric(18,4);
begin
  if not public.current_user_has_any_role(array['super_admin', 'admin', 'sales', 'finance']) then
    raise exception 'You do not have permission to update customer invoices.';
  end if;

  select * into v_invoice
  from public.customer_invoices
  where id = p_invoice_id
  for update;

  if v_invoice.id is null then
    raise exception 'Invoice not found.';
  end if;

  if v_invoice.ledger_managed then
    if p_paid_amount is not null and p_paid_amount is distinct from v_invoice.paid_amount then
      raise exception 'Ledger-managed invoice paid amount is derived from Project payment allocations.' using errcode = '42501';
    end if;
    if p_status in ('partially_paid', 'paid') then
      raise exception 'Ledger-managed invoice payment status is derived from Project payment allocations.' using errcode = '42501';
    end if;
  end if;

  if v_invoice.status = 'void' and coalesce(p_status, 'void') <> 'void' then
    raise exception 'A void invoice cannot be reactivated.';
  end if;

  v_paid := coalesce(p_paid_amount, v_invoice.paid_amount);
  if v_paid < 0 or v_paid > v_invoice.total_amount then
    raise exception 'Paid amount must be between zero and invoice total.';
  end if;

  v_status := coalesce(p_status,
    case
      when v_paid = 0 then v_invoice.status
      when v_paid >= v_invoice.total_amount then 'paid'
      else 'partially_paid'
    end
  );

  if v_status not in ('draft', 'issued', 'partially_paid', 'paid', 'overdue', 'void') then
    raise exception 'Invalid invoice status.';
  end if;

  if v_status = 'draft' and v_invoice.issued_at is not null then
    raise exception 'An issued invoice cannot return to draft.';
  end if;

  if v_status in ('partially_paid', 'paid') and v_invoice.issued_at is null then
    raise exception 'Issue the invoice before recording payment.';
  end if;

  if v_status = 'paid' then
    v_paid := v_invoice.total_amount;
  end if;

  update public.customer_invoices
  set
    status = v_status,
    paid_amount = v_paid,
    issued_at = case
      when v_status in ('issued', 'partially_paid', 'paid', 'overdue') and issued_at is null then now()
      else issued_at
    end,
    paid_at = case when v_status = 'paid' then coalesce(paid_at, now()) else null end,
    voided_at = case when v_status = 'void' then coalesce(voided_at, now()) else null end
  where id = p_invoice_id;

  return v_status;
end;
$function$;

create or replace function private.update_customer_invoice_state(
  p_invoice_id uuid,
  p_status text default null,
  p_paid_amount numeric default null
)
returns text
language plpgsql
security definer
set search_path to 'public', 'private', 'pg_temp'
as $function$
declare
  v_invoice public.customer_invoices%rowtype;
  v_request_id uuid;
  v_reasons jsonb := '[]'::jsonb;
  v_needs_approval boolean := false;
  v_key text;
  v_is_admin boolean;
  v_is_finance boolean;
  v_is_sales boolean;
begin
  v_is_admin := private.current_user_has_any_role(array['super_admin','admin']::text[]);
  v_is_finance := private.current_user_has_any_role(array['finance']::text[]);
  v_is_sales := private.current_user_has_any_role(array['sales']::text[]);

  if not (v_is_admin or v_is_finance or v_is_sales) then
    raise exception 'You do not have permission to update customer invoices.';
  end if;

  select * into v_invoice
  from public.customer_invoices
  where id = p_invoice_id;

  if v_invoice.id is null then
    raise exception 'Invoice not found.';
  end if;

  if v_invoice.ledger_managed then
    if p_paid_amount is not null and p_paid_amount is distinct from v_invoice.paid_amount then
      raise exception 'Ledger-managed invoice paid amount is derived from Project payment allocations.' using errcode = '42501';
    end if;
    if p_status in ('partially_paid', 'paid') then
      raise exception 'Ledger-managed invoice payment status is derived from Project payment allocations.' using errcode = '42501';
    end if;
  end if;

  if v_is_sales and not (v_is_admin or v_is_finance) then
    if p_status = 'void' and v_invoice.status <> 'void' then
      v_needs_approval := true;
      v_reasons := v_reasons || jsonb_build_array(
        jsonb_build_object('type','invoice_void','label','Voiding an invoice requires approval')
      );
    end if;

    if p_paid_amount is not null and p_paid_amount < coalesce(v_invoice.paid_amount, 0) then
      v_needs_approval := true;
      v_reasons := v_reasons || jsonb_build_array(
        jsonb_build_object(
          'type','payment_reversal',
          'label','Reducing a recorded paid amount requires approval',
          'current_paid',v_invoice.paid_amount,
          'proposed_paid',p_paid_amount
        )
      );
    end if;

    if v_invoice.status = 'paid' and p_status is not null and p_status <> 'paid' then
      v_needs_approval := true;
      v_reasons := v_reasons || jsonb_build_array(
        jsonb_build_object(
          'type','invoice_status_regression',
          'label','Changing a paid invoice to another status requires approval'
        )
      );
    end if;
  end if;

  if v_needs_approval then
    v_key := md5(
      v_invoice.updated_at::text || ':' || coalesce(p_status, '') || ':' || coalesce(p_paid_amount::text, '')
    );
    v_request_id := private.create_approval_request(
      'invoice_change',
      'invoice',
      p_invoice_id,
      v_invoice.invoice_number,
      'Invoice change requires approval.',
      jsonb_build_object(
        'updated_at',v_invoice.updated_at,
        'status',v_invoice.status,
        'paid_amount',v_invoice.paid_amount
      ),
      jsonb_build_object('status',p_status,'paid_amount',p_paid_amount),
      jsonb_build_object(
        'requires_approval',true,
        'reasons',v_reasons,
        'approval_key',v_key
      ),
      v_key
    );
    return 'approval_requested';
  end if;

  return private.update_customer_invoice_state_core(
    p_invoice_id,
    p_status,
    p_paid_amount
  );
end;
$function$;
