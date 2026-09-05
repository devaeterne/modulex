-- A6-F3B: Vendor Bills / AP Core.
-- Existing-system-first rules:
--   * public.vendor_invoices remains the canonical payable source document.
--   * customer_project_procurement_invoice_allocations remains procurement/project cost attribution.
--   * Finance remains the only money-movement ledger; F3B only allocates posted vendor_payment transactions.
--   * Vendor payment creation and check/payment-instrument lifecycle remain A6-F3C.

create schema if not exists private;

alter table public.vendor_invoices add column if not exists status text not null default 'open';
alter table public.vendor_invoices add column if not exists due_date date;
alter table public.vendor_invoices add column if not exists payment_term_id uuid references public.payment_terms(id) on update cascade on delete restrict;
alter table public.vendor_invoices add column if not exists purchase_order_reference text;
alter table public.vendor_invoices add column if not exists reference_no text;
alter table public.vendor_invoices add column if not exists notes text;
alter table public.vendor_invoices add column if not exists base_currency_code varchar(3);
alter table public.vendor_invoices add column if not exists base_amount numeric(18,4);
alter table public.vendor_invoices add column if not exists fx_rate numeric(24,10);
alter table public.vendor_invoices add column if not exists fx_rate_source text;
alter table public.vendor_invoices add column if not exists fx_rate_id uuid references public.finance_fx_rates(id) on update cascade on delete restrict;
alter table public.vendor_invoices add column if not exists opened_at timestamptz;
alter table public.vendor_invoices add column if not exists opened_by uuid references public.profiles(id) on delete set null;
alter table public.vendor_invoices add column if not exists voided_at timestamptz;
alter table public.vendor_invoices add column if not exists voided_by uuid references public.profiles(id) on delete set null;
alter table public.vendor_invoices add column if not exists void_reason text;
alter table public.vendor_invoices add column if not exists updated_by uuid references public.profiles(id) on delete set null;
alter table public.vendor_invoices add column if not exists source_document_bucket text;
alter table public.vendor_invoices add column if not exists source_document_path text;
alter table public.vendor_invoices add column if not exists source_document_file_name text;
alter table public.vendor_invoices add column if not exists source_document_mime_type text;
alter table public.vendor_invoices add column if not exists source_document_size_bytes bigint;

do $block$
begin
  if not exists (select 1 from pg_constraint where conname = 'vendor_invoices_status_check') then
    alter table public.vendor_invoices add constraint vendor_invoices_status_check check (status in ('draft','open','void'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'vendor_invoices_base_currency_check') then
    alter table public.vendor_invoices add constraint vendor_invoices_base_currency_check check (base_currency_code is null or (base_currency_code = upper(base_currency_code) and length(base_currency_code)=3));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'vendor_invoices_base_amount_check') then
    alter table public.vendor_invoices add constraint vendor_invoices_base_amount_check check (base_amount is null or base_amount > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'vendor_invoices_fx_rate_check') then
    alter table public.vendor_invoices add constraint vendor_invoices_fx_rate_check check (fx_rate is null or fx_rate > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'vendor_invoices_source_document_pair_check') then
    alter table public.vendor_invoices add constraint vendor_invoices_source_document_pair_check check (
      (source_document_bucket is null and source_document_path is null)
      or (nullif(btrim(coalesce(source_document_bucket,'')),'') is not null and nullif(btrim(coalesce(source_document_path,'')),'') is not null)
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'vendor_invoices_source_document_size_check') then
    alter table public.vendor_invoices add constraint vendor_invoices_source_document_size_check check (source_document_size_bytes is null or source_document_size_bytes >= 0);
  end if;
end;
$block$;

create unique index if not exists vendor_invoices_vendor_id_number_uidx
  on public.vendor_invoices(vendor_id, invoice_number_key)
  where vendor_id is not null;
create index if not exists vendor_invoices_due_status_idx on public.vendor_invoices(status, due_date, invoice_date desc);
create index if not exists vendor_invoices_payment_term_idx on public.vendor_invoices(payment_term_id) where payment_term_id is not null;
create index if not exists vendor_invoices_fx_rate_idx on public.vendor_invoices(fx_rate_id) where fx_rate_id is not null;
create index if not exists vendor_invoices_opened_by_idx on public.vendor_invoices(opened_by) where opened_by is not null;
create index if not exists vendor_invoices_voided_by_idx on public.vendor_invoices(voided_by) where voided_by is not null;
create index if not exists vendor_invoices_updated_by_idx on public.vendor_invoices(updated_by) where updated_by is not null;

create table public.vendor_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.vendor_invoices(id) on update cascade on delete restrict,
  line_no integer not null check (line_no > 0),
  description text not null check (length(btrim(description)) > 0),
  quantity numeric(18,4) null check (quantity is null or quantity > 0),
  unit_amount numeric(18,4) null check (unit_amount is null or unit_amount >= 0),
  amount numeric(18,4) not null check (amount > 0),
  project_id uuid null references public.customer_projects(id) on update cascade on delete restrict,
  order_id uuid null references public.customer_orders(id) on update cascade on delete restrict,
  procurement_commitment_id uuid null references public.customer_project_procurement_commitments(id) on update cascade on delete restrict,
  purchase_order_reference text null,
  notes text null,
  created_by uuid null references public.profiles(id) on delete set null,
  updated_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vendor_invoice_lines_number_uq unique(invoice_id, line_no)
);

create index vendor_invoice_lines_invoice_idx on public.vendor_invoice_lines(invoice_id, line_no);
create index vendor_invoice_lines_project_idx on public.vendor_invoice_lines(project_id) where project_id is not null;
create index vendor_invoice_lines_order_idx on public.vendor_invoice_lines(order_id) where order_id is not null;
create index vendor_invoice_lines_commitment_idx on public.vendor_invoice_lines(procurement_commitment_id) where procurement_commitment_id is not null;

create table public.vendor_invoice_payment_allocations (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.vendor_invoices(id) on update cascade on delete restrict,
  finance_transaction_id uuid not null references public.finance_transactions(id) on update cascade on delete restrict,
  amount_delta numeric(18,4) not null check (amount_delta <> 0),
  currency_code varchar(3) not null check (currency_code = upper(currency_code) and length(currency_code)=3),
  reversal_of_allocation_id uuid null references public.vendor_invoice_payment_allocations(id) on update cascade on delete restrict,
  reason text null,
  actor_id uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint vendor_invoice_payment_alloc_shape check (
    (amount_delta > 0 and reversal_of_allocation_id is null)
    or (amount_delta < 0 and reversal_of_allocation_id is not null and nullif(btrim(coalesce(reason,'')),'') is not null)
  )
);

create unique index vendor_invoice_payment_positive_uidx
  on public.vendor_invoice_payment_allocations(invoice_id, finance_transaction_id)
  where amount_delta > 0;
create unique index vendor_invoice_payment_reversal_uidx
  on public.vendor_invoice_payment_allocations(reversal_of_allocation_id)
  where reversal_of_allocation_id is not null;
create index vendor_invoice_payment_invoice_idx on public.vendor_invoice_payment_allocations(invoice_id, created_at);
create index vendor_invoice_payment_transaction_idx on public.vendor_invoice_payment_allocations(finance_transaction_id, created_at);

create table public.vendor_invoice_audit (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.vendor_invoices(id) on update cascade on delete restrict,
  action_type text not null check (length(btrim(action_type)) > 0),
  before_snapshot jsonb null,
  after_snapshot jsonb null,
  reason text null,
  actor_id uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index vendor_invoice_audit_invoice_idx on public.vendor_invoice_audit(invoice_id, created_at desc);

create table public.vendor_invoice_idempotency_requests (
  id uuid primary key default gen_random_uuid(),
  operation text not null check (length(btrim(operation)) > 0),
  idempotency_key uuid not null,
  request_fingerprint text not null check (length(btrim(request_fingerprint)) > 0),
  result_id uuid not null,
  result_type text not null check (result_type in ('invoice','payment_allocation')),
  created_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint vendor_invoice_idempotency_uq unique(operation,idempotency_key)
);

alter table public.vendor_invoice_lines enable row level security;
alter table public.vendor_invoice_payment_allocations enable row level security;
alter table public.vendor_invoice_audit enable row level security;
alter table public.vendor_invoice_idempotency_requests enable row level security;

create or replace function private.vendor_invoice_normalize_number(p_number text)
returns text
language sql
immutable
set search_path = ''
as $function$
  select pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.btrim(coalesce($1,'')), '[[:space:]]+', ' ', 'g'));
$function$;

create or replace function private.vendor_invoice_at(p_date date)
returns timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare v_timezone text;
begin
  select nullif(btrim(gs.timezone),'') into v_timezone from public.general_settings gs order by gs.id limit 1;
  return (p_date::timestamp + time '12:00') at time zone coalesce(v_timezone,'UTC');
end;
$function$;

create or replace function private.vendor_invoice_idempotency_existing(p_operation text,p_key uuid,p_fingerprint text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare v_row public.vendor_invoice_idempotency_requests%rowtype;
begin
  if p_key is null then raise exception 'Idempotency key is required.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('vendor_invoice:' || p_operation || ':' || p_key::text,0));
  select * into v_row from public.vendor_invoice_idempotency_requests r where r.operation=p_operation and r.idempotency_key=p_key;
  if v_row.id is null then return null; end if;
  if v_row.request_fingerprint is distinct from p_fingerprint then
    raise exception 'Idempotency key was already used with a different Vendor Bill request.' using errcode='22023';
  end if;
  return v_row.result_id;
end;
$function$;

create or replace function private.vendor_invoice_store_idempotency(p_operation text,p_key uuid,p_fingerprint text,p_result_id uuid,p_result_type text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.vendor_invoice_idempotency_requests(operation,idempotency_key,request_fingerprint,result_id,result_type,created_by)
  values (p_operation,p_key,p_fingerprint,p_result_id,p_result_type,auth.uid());
end;
$function$;

create or replace function private.vendor_invoice_write_audit(p_invoice_id uuid,p_action text,p_before jsonb,p_after jsonb,p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.vendor_invoice_audit(invoice_id,action_type,before_snapshot,after_snapshot,reason,actor_id)
  values (p_invoice_id,btrim(p_action),p_before,p_after,nullif(btrim(coalesce(p_reason,'')),''),auth.uid());
end;
$function$;

create or replace function private.vendor_invoice_paid_amount(p_invoice_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $function$
  select round(coalesce(sum(a.amount_delta),0),4) from public.vendor_invoice_payment_allocations a where a.invoice_id=$1;
$function$;

create or replace function private.vendor_invoice_payment_state(p_invoice_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare v_invoice public.vendor_invoices%rowtype; v_paid numeric;
begin
  select * into v_invoice from public.vendor_invoices where id=p_invoice_id;
  if v_invoice.id is null then return null; end if;
  if v_invoice.status='draft' then return 'draft'; end if;
  if v_invoice.status='void' then return 'void'; end if;
  v_paid := private.vendor_invoice_paid_amount(p_invoice_id);
  if v_paid <= 0 then return 'unpaid'; end if;
  if v_paid < v_invoice.total_amount then return 'partially_paid'; end if;
  return 'paid';
end;
$function$;

create or replace function private.vendor_invoice_resolve_vendor_by_code(p_vendor_code text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $function$
  select x.vendor_id
  from (
    select v.id as vendor_id, 0 as priority from public.vendors v where lower(v.code)=lower(btrim($1))
    union all
    select s.vendor_id, 1 from public.vendor_source_identities s
    where lower(s.source_code)=lower(btrim($1)) and s.source_system in ('procurement','vendor_invoice','legacy','manual')
  ) x
  order by x.priority
  limit 1;
$function$;

create or replace function private.vendor_invoice_apply_open_snapshot(
  p_invoice_id uuid,
  p_manual_fx_rate numeric default null,
  p_manual_fx_rate_source text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_invoice public.vendor_invoices%rowtype;
  v_vendor public.vendors%rowtype;
  v_base varchar(3);
  v_rate numeric(24,10);
  v_rate_source text;
  v_rate_id uuid;
  v_base_amount numeric(18,4);
  v_line_count integer;
  v_line_total numeric(18,4);
begin
  select * into v_invoice from public.vendor_invoices where id=p_invoice_id for update;
  if v_invoice.id is null then raise exception 'Vendor Bill not found.' using errcode='23503'; end if;
  if v_invoice.status <> 'draft' then raise exception 'Only a Vendor Bill draft can be opened.' using errcode='23514'; end if;
  if v_invoice.vendor_id is null then raise exception 'Canonical Vendor is required before opening a Vendor Bill.' using errcode='23514'; end if;
  select * into v_vendor from public.vendors where id=v_invoice.vendor_id;
  if v_vendor.id is null or v_vendor.status='inactive' then raise exception 'Vendor is missing or inactive.' using errcode='23514'; end if;
  if v_invoice.due_date is null then raise exception 'Vendor Bill due date is required.' using errcode='23514'; end if;

  select count(*),round(coalesce(sum(amount),0),4) into v_line_count,v_line_total from public.vendor_invoice_lines where invoice_id=p_invoice_id;
  if v_line_count > 0 and abs(v_line_total-v_invoice.total_amount) > 0.0001 then
    raise exception 'Vendor Bill line total must equal the authoritative bill total before opening.' using errcode='23514';
  end if;

  v_base := private.finance_base_currency();
  if v_invoice.currency_code=v_base then
    if p_manual_fx_rate is not null then raise exception 'Same-currency Vendor Bill does not accept an FX rate.' using errcode='22023'; end if;
    v_rate := null; v_rate_source := 'same_currency'; v_rate_id := null; v_base_amount := v_invoice.total_amount;
  elsif p_manual_fx_rate is not null then
    if p_manual_fx_rate <= 0 or nullif(btrim(coalesce(p_manual_fx_rate_source,'')),'') is null then
      raise exception 'Manual FX rate and source are required together.' using errcode='22023';
    end if;
    v_rate := p_manual_fx_rate; v_rate_source := 'manual:' || btrim(p_manual_fx_rate_source); v_rate_id := null;
    v_base_amount := round(v_invoice.total_amount*v_rate,4);
  else
    select r.rate,r.rate_source,r.id into v_rate,v_rate_source,v_rate_id
    from public.finance_fx_rates r
    where r.from_currency=v_invoice.currency_code and r.to_currency=v_base and r.is_active
      and r.observed_at <= private.vendor_invoice_at(v_invoice.invoice_date)
    order by r.observed_at desc,r.created_at desc limit 1;
    if v_rate is null then raise exception 'No eligible bill-date FX rate exists for this Vendor Bill.' using errcode='23514'; end if;
    v_base_amount := round(v_invoice.total_amount*v_rate,4);
  end if;

  update public.vendor_invoices
  set status='open',base_currency_code=v_base,base_amount=v_base_amount,fx_rate=v_rate,fx_rate_source=v_rate_source,fx_rate_id=v_rate_id,
      opened_at=now(),opened_by=auth.uid(),updated_by=auth.uid(),updated_at=now()
  where id=p_invoice_id;
end;
$function$;

create or replace function private.vendor_invoice_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare v_vendor public.vendors%rowtype; v_days smallint;
begin
  new.invoice_number := btrim(new.invoice_number);
  new.invoice_number_key := private.vendor_invoice_normalize_number(new.invoice_number);
  new.currency_code := upper(btrim(new.currency_code));
  if new.vendor_id is null then new.vendor_id := private.vendor_invoice_resolve_vendor_by_code(new.vendor_code); end if;
  if new.vendor_id is null then raise exception 'Map the invoice Vendor to a canonical Vendor before recording AP.' using errcode='23514'; end if;
  select * into v_vendor from public.vendors where id=new.vendor_id;
  if v_vendor.id is null or v_vendor.status='inactive' then raise exception 'Canonical Vendor is missing or inactive.' using errcode='23514'; end if;
  new.vendor_code := v_vendor.code;
  new.vendor_name_snapshot := v_vendor.display_name;
  if new.payment_term_id is null then new.payment_term_id := v_vendor.payment_term_id; end if;
  if new.due_date is null then
    select pt.days into v_days from public.payment_terms pt where pt.id=new.payment_term_id;
    new.due_date := new.invoice_date + coalesce(v_days,0);
  end if;
  new.purchase_order_reference := nullif(btrim(coalesce(new.purchase_order_reference,'')),'');
  new.reference_no := nullif(btrim(coalesce(new.reference_no,'')),'');
  new.notes := nullif(btrim(coalesce(new.notes,'')),'');
  new.updated_by := auth.uid();
  if new.status='open' then
    -- Existing record_customer_project_procurement_invoice inserts remain compatible:
    -- open-source documents receive a deterministic bill-date FX snapshot here.
    new.base_currency_code := private.finance_base_currency();
    if new.currency_code=new.base_currency_code then
      new.base_amount := new.total_amount; new.fx_rate := null; new.fx_rate_source := 'same_currency'; new.fx_rate_id := null;
    else
      select r.rate,r.rate_source,r.id into new.fx_rate,new.fx_rate_source,new.fx_rate_id
      from public.finance_fx_rates r
      where r.from_currency=new.currency_code and r.to_currency=new.base_currency_code and r.is_active
        and r.observed_at <= private.vendor_invoice_at(new.invoice_date)
      order by r.observed_at desc,r.created_at desc limit 1;
      if new.fx_rate is null then raise exception 'No eligible bill-date FX rate exists for this procurement Vendor Bill.' using errcode='23514'; end if;
      new.base_amount := round(new.total_amount*new.fx_rate,4);
    end if;
    new.opened_at := coalesce(new.opened_at,now());
    new.opened_by := coalesce(new.opened_by,auth.uid());
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_vendor_invoice_f3b_before_insert on public.vendor_invoices;
create trigger trg_vendor_invoice_f3b_before_insert before insert on public.vendor_invoices
for each row execute function private.vendor_invoice_before_insert();

create or replace function private.guard_vendor_invoice_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op='DELETE' then
    if old.status <> 'draft' then raise exception 'Open/void Vendor Bills are immutable.' using errcode='23514'; end if;
    return old;
  end if;
  if old.status='void' then raise exception 'Voided Vendor Bills are immutable.' using errcode='23514'; end if;
  if old.status='open' then
    if new.status <> 'void'
       or new.vendor_id is distinct from old.vendor_id or new.vendor_code is distinct from old.vendor_code
       or new.invoice_number is distinct from old.invoice_number or new.invoice_number_key is distinct from old.invoice_number_key
       or new.invoice_date is distinct from old.invoice_date or new.due_date is distinct from old.due_date
       or new.total_amount is distinct from old.total_amount or new.currency_code is distinct from old.currency_code
       or new.payment_term_id is distinct from old.payment_term_id or new.base_currency_code is distinct from old.base_currency_code
       or new.base_amount is distinct from old.base_amount or new.fx_rate is distinct from old.fx_rate
       or new.fx_rate_source is distinct from old.fx_rate_source or new.fx_rate_id is distinct from old.fx_rate_id
       or new.opened_at is distinct from old.opened_at or new.opened_by is distinct from old.opened_by
       or new.voided_at is null or new.voided_by is null or nullif(btrim(coalesce(new.void_reason,'')),'') is null then
      raise exception 'Open Vendor Bills are immutable; only guarded void is allowed.' using errcode='23514';
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_guard_vendor_invoice_history on public.vendor_invoices;
create trigger trg_guard_vendor_invoice_history before update or delete on public.vendor_invoices
for each row execute function private.guard_vendor_invoice_history();

create or replace function private.guard_vendor_invoice_lines()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare v_invoice_id uuid := coalesce(new.invoice_id,old.invoice_id); v_status text;
begin
  select status into v_status from public.vendor_invoices where id=v_invoice_id;
  if v_status <> 'draft' then raise exception 'Vendor Bill lines may change only while Draft.' using errcode='23514'; end if;
  return coalesce(new,old);
end;
$function$;

drop trigger if exists trg_guard_vendor_invoice_lines on public.vendor_invoice_lines;
create trigger trg_guard_vendor_invoice_lines before insert or update or delete on public.vendor_invoice_lines
for each row execute function private.guard_vendor_invoice_lines();

create or replace function private.guard_vendor_invoice_append_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  raise exception 'Vendor Bill settlement/audit/idempotency history is append-only.' using errcode='23514';
end;
$function$;

create trigger trg_vendor_invoice_payment_append_only before update or delete on public.vendor_invoice_payment_allocations for each row execute function private.guard_vendor_invoice_append_only();
create trigger trg_vendor_invoice_audit_append_only before update or delete on public.vendor_invoice_audit for each row execute function private.guard_vendor_invoice_append_only();
create trigger trg_vendor_invoice_idempotency_append_only before update or delete on public.vendor_invoice_idempotency_requests for each row execute function private.guard_vendor_invoice_append_only();

create or replace function private.guard_allocated_vendor_payment_void()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if old.transaction_kind='vendor_payment' and old.status='posted' and new.status='voided'
     and exists(select 1 from public.vendor_invoice_payment_allocations a where a.finance_transaction_id=old.id and a.amount_delta>0 and not exists(select 1 from public.vendor_invoice_payment_allocations r where r.reversal_of_allocation_id=a.id)) then
    raise exception 'Allocated Vendor payments cannot be voided; reverse the Finance payment and its bill allocations.' using errcode='23514';
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_guard_allocated_vendor_payment_void on public.finance_transactions;
create trigger trg_guard_allocated_vendor_payment_void before update on public.finance_transactions
for each row execute function private.guard_allocated_vendor_payment_void();

create or replace function private.get_vendor_invoices_page(
  p_limit integer default 50,p_offset integer default 0,p_vendor_id uuid default null,p_status text default null,p_search text default null,
  p_due_before date default null,p_project_id uuid default null,p_order_id uuid default null,p_currency_code text default null
)
returns table(
  id uuid,vendor_id uuid,vendor_code text,vendor_name_snapshot text,invoice_number text,invoice_date date,due_date date,total_amount numeric,
  currency_code varchar,status text,payment_status text,paid_amount numeric,outstanding_amount numeric,purchase_order_reference text,
  base_currency_code varchar,base_amount numeric,project_count bigint,order_count bigint,created_at timestamptz,total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  perform private.finance_assert_view();
  return query
  select i.id,i.vendor_id,i.vendor_code,i.vendor_name_snapshot,i.invoice_number,i.invoice_date,i.due_date,i.total_amount,i.currency_code,i.status,
    private.vendor_invoice_payment_state(i.id),
    private.vendor_invoice_paid_amount(i.id)::numeric,
    greatest(i.total_amount-private.vendor_invoice_paid_amount(i.id),0)::numeric,
    i.purchase_order_reference,i.base_currency_code,i.base_amount,
    (select count(distinct x.project_id) from (
      select l.project_id from public.vendor_invoice_lines l where l.invoice_id=i.id and l.project_id is not null
      union all select a.project_id from public.customer_project_procurement_invoice_allocations a where a.invoice_id=i.id and a.amount_delta>0
    ) x),
    (select count(distinct x.order_id) from (
      select l.order_id from public.vendor_invoice_lines l where l.invoice_id=i.id and l.order_id is not null
      union all select c.order_id from public.customer_project_procurement_invoice_allocations a join public.customer_project_procurement_commitments c on c.id=a.commitment_id where a.invoice_id=i.id and a.amount_delta>0
    ) x),
    i.created_at,count(*) over()
  from public.vendor_invoices i
  where (p_vendor_id is null or i.vendor_id=p_vendor_id)
    and (p_status is null or i.status=p_status or private.vendor_invoice_payment_state(i.id)=p_status)
    and (p_due_before is null or i.due_date<=p_due_before)
    and (p_currency_code is null or i.currency_code=upper(btrim(p_currency_code)))
    and (nullif(btrim(coalesce(p_search,'')),'') is null or i.invoice_number ilike '%'||btrim(p_search)||'%' or i.vendor_name_snapshot ilike '%'||btrim(p_search)||'%' or coalesce(i.reference_no,'') ilike '%'||btrim(p_search)||'%')
    and (p_project_id is null or exists(select 1 from public.vendor_invoice_lines l where l.invoice_id=i.id and l.project_id=p_project_id) or exists(select 1 from public.customer_project_procurement_invoice_allocations a where a.invoice_id=i.id and a.project_id=p_project_id))
    and (p_order_id is null or exists(select 1 from public.vendor_invoice_lines l where l.invoice_id=i.id and l.order_id=p_order_id) or exists(select 1 from public.customer_project_procurement_invoice_allocations a join public.customer_project_procurement_commitments c on c.id=a.commitment_id where a.invoice_id=i.id and c.order_id=p_order_id))
  order by case when i.status='open' and i.due_date<current_date and private.vendor_invoice_paid_amount(i.id)<i.total_amount then 0 else 1 end,i.due_date nulls last,i.invoice_date desc,i.id
  limit least(greatest(coalesce(p_limit,50),1),200) offset greatest(coalesce(p_offset,0),0);
end;
$function$;

create or replace function private.get_vendor_invoice_detail(p_invoice_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare v_invoice public.vendor_invoices%rowtype; v_paid numeric;
begin
  perform private.finance_assert_view();
  select * into v_invoice from public.vendor_invoices where id=p_invoice_id;
  if v_invoice.id is null then raise exception 'Vendor Bill not found.' using errcode='23503'; end if;
  v_paid := private.vendor_invoice_paid_amount(p_invoice_id);
  return jsonb_build_object(
    'invoice',to_jsonb(v_invoice)||jsonb_build_object('payment_status',private.vendor_invoice_payment_state(p_invoice_id),'paid_amount',v_paid,'outstanding_amount',greatest(v_invoice.total_amount-v_paid,0)),
    'vendor',(select to_jsonb(v) from public.vendors v where v.id=v_invoice.vendor_id),
    'lines',coalesce((select jsonb_agg(to_jsonb(l) order by l.line_no) from public.vendor_invoice_lines l where l.invoice_id=p_invoice_id),'[]'::jsonb),
    'procurement_allocations',coalesce((select jsonb_agg(to_jsonb(a)||jsonb_build_object('vendor_order_no',c.vendor_order_no,'order_id',c.order_id) order by a.created_at,a.id) from public.customer_project_procurement_invoice_allocations a join public.customer_project_procurement_commitments c on c.id=a.commitment_id where a.invoice_id=p_invoice_id),'[]'::jsonb),
    'payment_allocations',coalesce((select jsonb_agg(to_jsonb(a)||jsonb_build_object('transaction_kind',t.transaction_kind,'transaction_status',t.status,'transaction_at',t.transaction_at,'reference_no',t.reference_no) order by a.created_at,a.id) from public.vendor_invoice_payment_allocations a join public.finance_transactions t on t.id=a.finance_transaction_id where a.invoice_id=p_invoice_id),'[]'::jsonb),
    'audit',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at,a.id) from public.vendor_invoice_audit a where a.invoice_id=p_invoice_id),'[]'::jsonb)
  );
end;
$function$;

create or replace function private.create_vendor_invoice_draft(
  p_vendor_id uuid,p_invoice_number text,p_invoice_date date,p_due_date date,p_total_amount numeric,p_currency_code text,
  p_payment_term_id uuid default null,p_purchase_order_reference text default null,p_reference_no text default null,p_notes text default null,
  p_source_document_bucket text default null,p_source_document_path text default null,p_source_document_file_name text default null,p_source_document_mime_type text default null,p_source_document_size_bytes bigint default null,
  p_idempotency_key uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare v_vendor public.vendors%rowtype; v_id uuid; v_key text; v_existing uuid; v_fingerprint text; v_due date; v_days smallint;
begin
  perform private.finance_assert_manage();
  select * into v_vendor from public.vendors where id=p_vendor_id;
  if v_vendor.id is null or v_vendor.status='inactive' then raise exception 'Canonical Vendor is required and must not be inactive.' using errcode='23514'; end if;
  if nullif(btrim(coalesce(p_invoice_number,'')),'') is null or p_invoice_date is null or p_total_amount is null or p_total_amount<=0 then raise exception 'Vendor Bill number, date, and positive total are required.' using errcode='22023'; end if;
  if length(btrim(coalesce(p_currency_code,'')))<>3 then raise exception 'Vendor Bill currency must contain three letters.' using errcode='22023'; end if;
  v_key := private.vendor_invoice_normalize_number(p_invoice_number);
  v_fingerprint := md5(jsonb_build_object('vendor',p_vendor_id,'number',v_key,'date',p_invoice_date,'due',p_due_date,'total',p_total_amount,'currency',upper(btrim(p_currency_code)))::text);
  v_existing := private.vendor_invoice_idempotency_existing('create_draft',p_idempotency_key,v_fingerprint);
  if v_existing is not null then return v_existing; end if;
  perform pg_advisory_xact_lock(hashtextextended('vendor_invoice_identity:'||p_vendor_id::text||':'||v_key,0));
  if exists(select 1 from public.vendor_invoices i where i.vendor_id=p_vendor_id and i.invoice_number_key=v_key) then raise exception 'Duplicate Vendor Bill number for this canonical Vendor.' using errcode='23505'; end if;
  if p_payment_term_id is not null and not exists(select 1 from public.payment_terms pt where pt.id=p_payment_term_id and pt.is_active) then raise exception 'Payment term is missing or inactive.' using errcode='23514'; end if;
  if p_due_date is null then
    select pt.days into v_days from public.payment_terms pt where pt.id=coalesce(p_payment_term_id,v_vendor.payment_term_id);
    v_due := p_invoice_date+coalesce(v_days,0);
  else v_due := p_due_date; end if;
  if v_due < p_invoice_date then raise exception 'Vendor Bill due date cannot precede bill date.' using errcode='22023'; end if;
  if (nullif(btrim(coalesce(p_source_document_bucket,'')),'') is null) <> (nullif(btrim(coalesce(p_source_document_path,'')),'') is null) then raise exception 'Source document bucket/path must be supplied together.' using errcode='22023'; end if;

  insert into public.vendor_invoices(vendor_id,vendor_code,vendor_name_snapshot,invoice_number,invoice_number_key,invoice_date,due_date,total_amount,currency_code,status,payment_term_id,purchase_order_reference,reference_no,notes,created_by,updated_by,source_document_bucket,source_document_path,source_document_file_name,source_document_mime_type,source_document_size_bytes)
  values (v_vendor.id,v_vendor.code,v_vendor.display_name,btrim(p_invoice_number),v_key,p_invoice_date,v_due,p_total_amount,upper(btrim(p_currency_code)),'draft',coalesce(p_payment_term_id,v_vendor.payment_term_id),p_purchase_order_reference,p_reference_no,p_notes,auth.uid(),auth.uid(),nullif(btrim(coalesce(p_source_document_bucket,'')),''),nullif(btrim(coalesce(p_source_document_path,'')),''),nullif(btrim(coalesce(p_source_document_file_name,'')),''),nullif(btrim(coalesce(p_source_document_mime_type,'')),''),p_source_document_size_bytes)
  returning id into v_id;
  perform private.vendor_invoice_write_audit(v_id,'create',null,(select to_jsonb(i) from public.vendor_invoices i where i.id=v_id));
  perform private.vendor_invoice_store_idempotency('create_draft',p_idempotency_key,v_fingerprint,v_id,'invoice');
  return v_id;
end;
$function$;

create or replace function private.update_vendor_invoice_draft(
  p_invoice_id uuid,p_invoice_number text,p_invoice_date date,p_due_date date,p_total_amount numeric,p_currency_code text,p_payment_term_id uuid default null,
  p_purchase_order_reference text default null,p_reference_no text default null,p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare v_invoice public.vendor_invoices%rowtype; v_before jsonb; v_key text;
begin
  perform private.finance_assert_manage();
  select * into v_invoice from public.vendor_invoices where id=p_invoice_id for update;
  if v_invoice.id is null or v_invoice.status<>'draft' then raise exception 'Editable Vendor Bill draft not found.' using errcode='23514'; end if;
  if nullif(btrim(coalesce(p_invoice_number,'')),'') is null or p_invoice_date is null or p_due_date is null or p_total_amount is null or p_total_amount<=0 then raise exception 'Vendor Bill number, dates and positive total are required.' using errcode='22023'; end if;
  if p_due_date<p_invoice_date then raise exception 'Vendor Bill due date cannot precede bill date.' using errcode='22023'; end if;
  if length(btrim(coalesce(p_currency_code,'')))<>3 then raise exception 'Vendor Bill currency must contain three letters.' using errcode='22023'; end if;
  v_key := private.vendor_invoice_normalize_number(p_invoice_number);
  perform pg_advisory_xact_lock(hashtextextended('vendor_invoice_identity:'||v_invoice.vendor_id::text||':'||v_key,0));
  if exists(select 1 from public.vendor_invoices i where i.vendor_id=v_invoice.vendor_id and i.invoice_number_key=v_key and i.id<>p_invoice_id) then raise exception 'Duplicate Vendor Bill number for this canonical Vendor.' using errcode='23505'; end if;
  v_before:=to_jsonb(v_invoice);
  update public.vendor_invoices set invoice_number=btrim(p_invoice_number),invoice_number_key=v_key,invoice_date=p_invoice_date,due_date=p_due_date,total_amount=p_total_amount,currency_code=upper(btrim(p_currency_code)),payment_term_id=p_payment_term_id,purchase_order_reference=nullif(btrim(coalesce(p_purchase_order_reference,'')),''),reference_no=nullif(btrim(coalesce(p_reference_no,'')),''),notes=nullif(btrim(coalesce(p_notes,'')),''),updated_by=auth.uid(),updated_at=now() where id=p_invoice_id;
  perform private.vendor_invoice_write_audit(p_invoice_id,'update',v_before,(select to_jsonb(i) from public.vendor_invoices i where i.id=p_invoice_id));
  return p_invoice_id;
end;
$function$;

create or replace function private.set_vendor_invoice_lines(p_invoice_id uuid,p_lines jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare v_invoice public.vendor_invoices%rowtype; v_item jsonb; v_count integer:=0; v_project uuid; v_order uuid; v_commitment uuid; v_order_project uuid; v_commit public.customer_project_procurement_commitments%rowtype;
begin
  perform private.finance_assert_manage();
  select * into v_invoice from public.vendor_invoices where id=p_invoice_id for update;
  if v_invoice.id is null or v_invoice.status<>'draft' then raise exception 'Vendor Bill lines may only change on a draft.' using errcode='23514'; end if;
  if p_lines is null or jsonb_typeof(p_lines)<>'array' then raise exception 'Vendor Bill lines must be a JSON array.' using errcode='22023'; end if;
  delete from public.vendor_invoice_lines where invoice_id=p_invoice_id;
  for v_item in select value from jsonb_array_elements(p_lines) loop
    v_count:=v_count+1;
    v_project:=nullif(v_item->>'project_id','')::uuid; v_order:=nullif(v_item->>'order_id','')::uuid; v_commitment:=nullif(v_item->>'procurement_commitment_id','')::uuid;
    if nullif(btrim(coalesce(v_item->>'description','')),'') is null or nullif(v_item->>'amount','')::numeric is null or (v_item->>'amount')::numeric<=0 then raise exception 'Each Vendor Bill line requires description and positive amount.' using errcode='22023'; end if;
    if v_order is not null then select o.project_id into v_order_project from public.customer_orders o where o.id=v_order; if v_order_project is null then raise exception 'Vendor Bill line Order not found.' using errcode='23503'; end if; if v_project is not null and v_project<>v_order_project then raise exception 'Vendor Bill line Order/Project mismatch.' using errcode='23514'; end if; v_project:=coalesce(v_project,v_order_project); end if;
    if v_commitment is not null then select * into v_commit from public.customer_project_procurement_commitments c where c.id=v_commitment; if v_commit.id is null then raise exception 'Procurement commitment not found.' using errcode='23503'; end if; if v_commit.vendor_id is distinct from v_invoice.vendor_id then raise exception 'Procurement commitment Vendor does not match Vendor Bill.' using errcode='23514'; end if; if v_project is not null and v_project<>v_commit.project_id then raise exception 'Procurement commitment Project mismatch.' using errcode='23514'; end if; if v_order is not null and v_order<>v_commit.order_id then raise exception 'Procurement commitment Order mismatch.' using errcode='23514'; end if; v_project:=v_commit.project_id; v_order:=v_commit.order_id; end if;
    insert into public.vendor_invoice_lines(invoice_id,line_no,description,quantity,unit_amount,amount,project_id,order_id,procurement_commitment_id,purchase_order_reference,notes,created_by,updated_by)
    values(p_invoice_id,v_count,btrim(v_item->>'description'),nullif(v_item->>'quantity','')::numeric,nullif(v_item->>'unit_amount','')::numeric,(v_item->>'amount')::numeric,v_project,v_order,v_commitment,nullif(btrim(coalesce(v_item->>'purchase_order_reference','')),''),nullif(btrim(coalesce(v_item->>'notes','')),''),auth.uid(),auth.uid());
  end loop;
  perform private.vendor_invoice_write_audit(p_invoice_id,'lines',null,jsonb_build_object('lines',p_lines));
  return v_count;
end;
$function$;

create or replace function private.open_vendor_invoice(p_invoice_id uuid,p_manual_fx_rate numeric default null,p_manual_fx_rate_source text default null,p_idempotency_key uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare v_existing uuid; v_fingerprint text; v_before jsonb;
begin
  perform private.finance_assert_manage();
  v_fingerprint:=md5(jsonb_build_object('invoice',p_invoice_id,'manual_rate',p_manual_fx_rate,'manual_source',nullif(btrim(coalesce(p_manual_fx_rate_source,'')),''))::text);
  v_existing:=private.vendor_invoice_idempotency_existing('open',p_idempotency_key,v_fingerprint); if v_existing is not null then return v_existing; end if;
  select to_jsonb(i) into v_before from public.vendor_invoices i where i.id=p_invoice_id and i.status='draft' for update;
  if v_before is null then raise exception 'Only a Vendor Bill draft can be opened.' using errcode='23514'; end if;
  perform private.vendor_invoice_apply_open_snapshot(p_invoice_id,p_manual_fx_rate,p_manual_fx_rate_source);
  perform private.vendor_invoice_write_audit(p_invoice_id,'open',v_before,(select to_jsonb(i) from public.vendor_invoices i where i.id=p_invoice_id));
  perform private.vendor_invoice_store_idempotency('open',p_idempotency_key,v_fingerprint,p_invoice_id,'invoice');
  return p_invoice_id;
end;
$function$;

create or replace function private.void_vendor_invoice(p_invoice_id uuid,p_reason text,p_idempotency_key uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare v_invoice public.vendor_invoices%rowtype; v_existing uuid; v_fingerprint text; v_before jsonb; v_paid numeric;
begin
  perform private.finance_assert_manage();
  if nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception 'Vendor Bill void reason is required.' using errcode='22023'; end if;
  v_fingerprint:=md5(jsonb_build_object('invoice',p_invoice_id,'reason',btrim(p_reason))::text);
  v_existing:=private.vendor_invoice_idempotency_existing('void',p_idempotency_key,v_fingerprint); if v_existing is not null then return v_existing; end if;
  select * into v_invoice from public.vendor_invoices where id=p_invoice_id for update;
  if v_invoice.id is null or v_invoice.status<>'open' then raise exception 'Only an open Vendor Bill can be voided.' using errcode='23514'; end if;
  v_paid:=private.vendor_invoice_paid_amount(p_invoice_id); if abs(v_paid)>0.0001 then raise exception 'Vendor Bill with payment allocations cannot be voided; reverse allocations first.' using errcode='23514'; end if;
  v_before:=to_jsonb(v_invoice);
  update public.vendor_invoices set status='void',voided_at=now(),voided_by=auth.uid(),void_reason=btrim(p_reason),updated_by=auth.uid(),updated_at=now() where id=p_invoice_id;
  perform private.vendor_invoice_write_audit(p_invoice_id,'void',v_before,(select to_jsonb(i) from public.vendor_invoices i where i.id=p_invoice_id),p_reason);
  perform private.vendor_invoice_store_idempotency('void',p_idempotency_key,v_fingerprint,p_invoice_id,'invoice');
  return p_invoice_id;
end;
$function$;

create or replace function private.allocate_vendor_payment_to_invoice(p_invoice_id uuid,p_finance_transaction_id uuid,p_amount numeric,p_idempotency_key uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare v_invoice public.vendor_invoices%rowtype; v_tx public.finance_transactions%rowtype; v_paid numeric; v_tx_alloc numeric; v_id uuid; v_existing uuid; v_fingerprint text; v_vendor_code text;
begin
  perform private.finance_assert_manage();
  if p_amount is null or p_amount<=0 then raise exception 'Payment allocation amount must be greater than zero.' using errcode='22023'; end if;
  v_fingerprint:=md5(jsonb_build_object('invoice',p_invoice_id,'transaction',p_finance_transaction_id,'amount',p_amount)::text);
  v_existing:=private.vendor_invoice_idempotency_existing('payment_allocate',p_idempotency_key,v_fingerprint); if v_existing is not null then return v_existing; end if;
  select * into v_invoice from public.vendor_invoices where id=p_invoice_id for update;
  if v_invoice.id is null or v_invoice.status<>'open' then raise exception 'Payment allocations require an open Vendor Bill.' using errcode='23514'; end if;
  select * into v_tx from public.finance_transactions where id=p_finance_transaction_id for update;
  if v_tx.id is null or v_tx.status<>'posted' or v_tx.transaction_kind<>'vendor_payment' then raise exception 'Allocation requires a posted vendor_payment Finance transaction.' using errcode='23514'; end if;
  if v_tx.currency_code<>v_invoice.currency_code then raise exception 'Vendor payment currency must match Vendor Bill currency.' using errcode='23514'; end if;
  select v.code into v_vendor_code from public.vendors v where v.id=v_invoice.vendor_id;
  if not exists(
    select 1 from public.finance_transaction_links l
    where l.transaction_id=v_tx.id and (
      l.vendor_id=v_invoice.vendor_id
      or lower(coalesce(l.vendor_code,''))=lower(coalesce(v_vendor_code,''))
      or exists(select 1 from public.vendor_source_identities s where s.vendor_id=v_invoice.vendor_id and lower(s.source_code)=lower(coalesce(l.vendor_code,'')))
      or (l.source_document_type='vendor_invoice' and l.source_document_id=v_invoice.id)
    )
  ) then raise exception 'Vendor payment must be attributed to the canonical Vendor before bill allocation.' using errcode='23514'; end if;
  v_paid:=private.vendor_invoice_paid_amount(p_invoice_id);
  if v_paid+p_amount>v_invoice.total_amount+0.0001 then raise exception 'Vendor Bill overpayment is not supported; allocation exceeds outstanding amount.' using errcode='23514'; end if;
  select coalesce(sum(a.amount_delta),0) into v_tx_alloc from public.vendor_invoice_payment_allocations a where a.finance_transaction_id=v_tx.id;
  if v_tx_alloc+p_amount>v_tx.amount+0.0001 then raise exception 'Vendor payment allocations cannot exceed the authoritative Finance transaction amount.' using errcode='23514'; end if;
  insert into public.vendor_invoice_payment_allocations(invoice_id,finance_transaction_id,amount_delta,currency_code,actor_id)
  values(p_invoice_id,p_finance_transaction_id,p_amount,v_invoice.currency_code,auth.uid()) returning id into v_id;
  perform private.vendor_invoice_write_audit(p_invoice_id,'payment_allocate',null,(select to_jsonb(a) from public.vendor_invoice_payment_allocations a where a.id=v_id));
  perform private.vendor_invoice_store_idempotency('payment_allocate',p_idempotency_key,v_fingerprint,v_id,'payment_allocation');
  return v_id;
end;
$function$;

create or replace function private.reverse_vendor_invoice_payment_allocation(p_allocation_id uuid,p_reversal_finance_transaction_id uuid,p_reason text,p_idempotency_key uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare v_original public.vendor_invoice_payment_allocations%rowtype; v_tx public.finance_transactions%rowtype; v_id uuid; v_existing uuid; v_fingerprint text;
begin
  perform private.finance_assert_manage();
  if nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception 'Payment allocation reversal reason is required.' using errcode='22023'; end if;
  v_fingerprint:=md5(jsonb_build_object('allocation',p_allocation_id,'reversal_transaction',p_reversal_finance_transaction_id,'reason',btrim(p_reason))::text);
  v_existing:=private.vendor_invoice_idempotency_existing('payment_allocation_reverse',p_idempotency_key,v_fingerprint); if v_existing is not null then return v_existing; end if;
  select * into v_original from public.vendor_invoice_payment_allocations where id=p_allocation_id for update;
  if v_original.id is null or v_original.amount_delta<=0 then raise exception 'Original positive Vendor Bill payment allocation not found.' using errcode='23503'; end if;
  if exists(select 1 from public.vendor_invoice_payment_allocations r where r.reversal_of_allocation_id=v_original.id) then raise exception 'Vendor Bill payment allocation has already been reversed.' using errcode='23514'; end if;
  select * into v_tx from public.finance_transactions where id=p_reversal_finance_transaction_id;
  if v_tx.id is null or v_tx.status<>'posted' or v_tx.transaction_kind<>'reversal' or v_tx.reversal_of_transaction_id<>v_original.finance_transaction_id then raise exception 'Allocation reversal requires the posted Finance reversal of the original vendor payment.' using errcode='23514'; end if;
  insert into public.vendor_invoice_payment_allocations(invoice_id,finance_transaction_id,amount_delta,currency_code,reversal_of_allocation_id,reason,actor_id)
  values(v_original.invoice_id,p_reversal_finance_transaction_id,-v_original.amount_delta,v_original.currency_code,v_original.id,btrim(p_reason),auth.uid()) returning id into v_id;
  perform private.vendor_invoice_write_audit(v_original.invoice_id,'payment_allocation_reverse',to_jsonb(v_original),(select to_jsonb(a) from public.vendor_invoice_payment_allocations a where a.id=v_id),p_reason);
  perform private.vendor_invoice_store_idempotency('payment_allocation_reverse',p_idempotency_key,v_fingerprint,v_id,'payment_allocation');
  return v_id;
end;
$function$;

create or replace function private.delete_vendor_invoice_draft(p_invoice_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare v_invoice public.vendor_invoices%rowtype;
begin
  perform private.finance_assert_manage();
  select * into v_invoice from public.vendor_invoices where id=p_invoice_id for update;
  if v_invoice.id is null or v_invoice.status<>'draft' then raise exception 'Only a Vendor Bill draft can be deleted.' using errcode='23514'; end if;
  perform private.vendor_invoice_write_audit(p_invoice_id,'delete',to_jsonb(v_invoice),null);
  delete from public.vendor_invoice_lines where invoice_id=p_invoice_id;
  delete from public.vendor_invoices where id=p_invoice_id;
  return p_invoice_id;
end;
$function$;

-- Existing record_customer_project_procurement_invoice is deliberately reused.
-- Its inserts now pass through trg_vendor_invoice_f3b_before_insert, which resolves the canonical Vendor,
-- derives payment terms/due date, and stores the bill-date base-currency snapshot without replacing
-- customer_project_procurement_invoice_allocations.

create or replace function public.get_vendor_invoices_page(p_limit integer default 50,p_offset integer default 0,p_vendor_id uuid default null,p_status text default null,p_search text default null,p_due_before date default null,p_project_id uuid default null,p_order_id uuid default null,p_currency_code text default null)
returns table(id uuid,vendor_id uuid,vendor_code text,vendor_name_snapshot text,invoice_number text,invoice_date date,due_date date,total_amount numeric,currency_code varchar,status text,payment_status text,paid_amount numeric,outstanding_amount numeric,purchase_order_reference text,base_currency_code varchar,base_amount numeric,project_count bigint,order_count bigint,created_at timestamptz,total_count bigint)
language sql stable security definer set search_path = ''
as $function$ select * from private.get_vendor_invoices_page($1,$2,$3,$4,$5,$6,$7,$8,$9); $function$;

create or replace function public.get_vendor_invoice_detail(p_invoice_id uuid)
returns jsonb language sql stable security definer set search_path = ''
as $function$ select private.get_vendor_invoice_detail($1); $function$;

create or replace function public.create_vendor_invoice_draft(p_vendor_id uuid,p_invoice_number text,p_invoice_date date,p_due_date date,p_total_amount numeric,p_currency_code text,p_payment_term_id uuid default null,p_purchase_order_reference text default null,p_reference_no text default null,p_notes text default null,p_source_document_bucket text default null,p_source_document_path text default null,p_source_document_file_name text default null,p_source_document_mime_type text default null,p_source_document_size_bytes bigint default null,p_idempotency_key uuid default null)
returns uuid language sql security definer set search_path = ''
as $function$ select private.create_vendor_invoice_draft($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16); $function$;

create or replace function public.update_vendor_invoice_draft(p_invoice_id uuid,p_invoice_number text,p_invoice_date date,p_due_date date,p_total_amount numeric,p_currency_code text,p_payment_term_id uuid default null,p_purchase_order_reference text default null,p_reference_no text default null,p_notes text default null)
returns uuid language sql security definer set search_path = ''
as $function$ select private.update_vendor_invoice_draft($1,$2,$3,$4,$5,$6,$7,$8,$9,$10); $function$;

create or replace function public.set_vendor_invoice_lines(p_invoice_id uuid,p_lines jsonb)
returns integer language sql security definer set search_path = ''
as $function$ select private.set_vendor_invoice_lines($1,$2); $function$;

create or replace function public.open_vendor_invoice(p_invoice_id uuid,p_manual_fx_rate numeric default null,p_manual_fx_rate_source text default null,p_idempotency_key uuid default null)
returns uuid language sql security definer set search_path = ''
as $function$ select private.open_vendor_invoice($1,$2,$3,$4); $function$;

create or replace function public.void_vendor_invoice(p_invoice_id uuid,p_reason text,p_idempotency_key uuid default null)
returns uuid language sql security definer set search_path = ''
as $function$ select private.void_vendor_invoice($1,$2,$3); $function$;

create or replace function public.allocate_vendor_payment_to_invoice(p_invoice_id uuid,p_finance_transaction_id uuid,p_amount numeric,p_idempotency_key uuid default null)
returns uuid language sql security definer set search_path = ''
as $function$ select private.allocate_vendor_payment_to_invoice($1,$2,$3,$4); $function$;

create or replace function public.reverse_vendor_invoice_payment_allocation(p_allocation_id uuid,p_reversal_finance_transaction_id uuid,p_reason text,p_idempotency_key uuid default null)
returns uuid language sql security definer set search_path = ''
as $function$ select private.reverse_vendor_invoice_payment_allocation($1,$2,$3,$4); $function$;

create or replace function public.delete_vendor_invoice_draft(p_invoice_id uuid)
returns uuid language sql security definer set search_path = ''
as $function$ select private.delete_vendor_invoice_draft($1); $function$;

-- Preserve direct-table closure. RPC/private-core remains the AP boundary.
revoke insert,update,delete,truncate on public.vendor_invoices from anon,authenticated;
revoke all on public.vendor_invoice_lines from public,anon,authenticated;
revoke all on public.vendor_invoice_payment_allocations from public,anon,authenticated;
revoke all on public.vendor_invoice_audit from public,anon,authenticated;
revoke all on public.vendor_invoice_idempotency_requests from public,anon,authenticated;

create policy vendor_invoice_lines_anon_deny on public.vendor_invoice_lines as restrictive for all to anon using(false) with check(false);
create policy vendor_invoice_lines_authenticated_deny on public.vendor_invoice_lines as restrictive for all to authenticated using(false) with check(false);
create policy vendor_invoice_payment_alloc_anon_deny on public.vendor_invoice_payment_allocations as restrictive for all to anon using(false) with check(false);
create policy vendor_invoice_payment_alloc_authenticated_deny on public.vendor_invoice_payment_allocations as restrictive for all to authenticated using(false) with check(false);
create policy vendor_invoice_audit_anon_deny on public.vendor_invoice_audit as restrictive for all to anon using(false) with check(false);
create policy vendor_invoice_audit_authenticated_deny on public.vendor_invoice_audit as restrictive for all to authenticated using(false) with check(false);
create policy vendor_invoice_idempotency_anon_deny on public.vendor_invoice_idempotency_requests as restrictive for all to anon using(false) with check(false);
create policy vendor_invoice_idempotency_authenticated_deny on public.vendor_invoice_idempotency_requests as restrictive for all to authenticated using(false) with check(false);

revoke all on function private.vendor_invoice_normalize_number(text) from public,anon,authenticated,service_role;
revoke all on function private.vendor_invoice_at(date) from public,anon,authenticated,service_role;
revoke all on function private.vendor_invoice_idempotency_existing(text,uuid,text) from public,anon,authenticated,service_role;
revoke all on function private.vendor_invoice_store_idempotency(text,uuid,text,uuid,text) from public,anon,authenticated,service_role;
revoke all on function private.vendor_invoice_write_audit(uuid,text,jsonb,jsonb,text) from public,anon,authenticated,service_role;
revoke all on function private.vendor_invoice_paid_amount(uuid) from public,anon,authenticated,service_role;
revoke all on function private.vendor_invoice_payment_state(uuid) from public,anon,authenticated,service_role;
revoke all on function private.vendor_invoice_resolve_vendor_by_code(text) from public,anon,authenticated,service_role;
revoke all on function private.vendor_invoice_apply_open_snapshot(uuid,numeric,text) from public,anon,authenticated,service_role;
revoke all on function private.get_vendor_invoices_page(integer,integer,uuid,text,text,date,uuid,uuid,text) from public,anon,authenticated,service_role;
revoke all on function private.get_vendor_invoice_detail(uuid) from public,anon,authenticated,service_role;
revoke all on function private.create_vendor_invoice_draft(uuid,text,date,date,numeric,text,uuid,text,text,text,text,text,text,text,bigint,uuid) from public,anon,authenticated,service_role;
revoke all on function private.update_vendor_invoice_draft(uuid,text,date,date,numeric,text,uuid,text,text,text) from public,anon,authenticated,service_role;
revoke all on function private.set_vendor_invoice_lines(uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function private.open_vendor_invoice(uuid,numeric,text,uuid) from public,anon,authenticated,service_role;
revoke all on function private.void_vendor_invoice(uuid,text,uuid) from public,anon,authenticated,service_role;
revoke all on function private.allocate_vendor_payment_to_invoice(uuid,uuid,numeric,uuid) from public,anon,authenticated,service_role;
revoke all on function private.reverse_vendor_invoice_payment_allocation(uuid,uuid,text,uuid) from public,anon,authenticated,service_role;
revoke all on function private.delete_vendor_invoice_draft(uuid) from public,anon,authenticated,service_role;

revoke execute on function public.get_vendor_invoices_page(integer,integer,uuid,text,text,date,uuid,uuid,text) from public,anon;
revoke execute on function public.get_vendor_invoice_detail(uuid) from public,anon;
revoke execute on function public.create_vendor_invoice_draft(uuid,text,date,date,numeric,text,uuid,text,text,text,text,text,text,text,bigint,uuid) from public,anon;
revoke execute on function public.update_vendor_invoice_draft(uuid,text,date,date,numeric,text,uuid,text,text,text) from public,anon;
revoke execute on function public.set_vendor_invoice_lines(uuid,jsonb) from public,anon;
revoke execute on function public.open_vendor_invoice(uuid,numeric,text,uuid) from public,anon;
revoke execute on function public.void_vendor_invoice(uuid,text,uuid) from public,anon;
revoke execute on function public.allocate_vendor_payment_to_invoice(uuid,uuid,numeric,uuid) from public,anon;
revoke execute on function public.reverse_vendor_invoice_payment_allocation(uuid,uuid,text,uuid) from public,anon;
revoke execute on function public.delete_vendor_invoice_draft(uuid) from public,anon;

grant execute on function public.get_vendor_invoices_page(integer,integer,uuid,text,text,date,uuid,uuid,text) to authenticated,service_role;
grant execute on function public.get_vendor_invoice_detail(uuid) to authenticated,service_role;
grant execute on function public.create_vendor_invoice_draft(uuid,text,date,date,numeric,text,uuid,text,text,text,text,text,text,text,bigint,uuid) to authenticated,service_role;
grant execute on function public.update_vendor_invoice_draft(uuid,text,date,date,numeric,text,uuid,text,text,text) to authenticated,service_role;
grant execute on function public.set_vendor_invoice_lines(uuid,jsonb) to authenticated,service_role;
grant execute on function public.open_vendor_invoice(uuid,numeric,text,uuid) to authenticated,service_role;
grant execute on function public.void_vendor_invoice(uuid,text,uuid) to authenticated,service_role;
grant execute on function public.allocate_vendor_payment_to_invoice(uuid,uuid,numeric,uuid) to authenticated,service_role;
grant execute on function public.reverse_vendor_invoice_payment_allocation(uuid,uuid,text,uuid) to authenticated,service_role;
grant execute on function public.delete_vendor_invoice_draft(uuid) to authenticated,service_role;

-- Backfill any pre-F3B Vendor invoices as open historical AP documents without inventing payment history.
update public.vendor_invoices i
set vendor_id=coalesce(i.vendor_id,private.vendor_invoice_resolve_vendor_by_code(i.vendor_code)),
    due_date=coalesce(i.due_date,i.invoice_date),
    status='open',
    updated_by=coalesce(i.updated_by,i.created_by),
    opened_at=coalesce(i.opened_at,i.created_at),
    opened_by=coalesce(i.opened_by,i.created_by)
where i.status is null or i.status='open';

-- Fail closed if historical source rows cannot be mapped to the canonical Vendor master.
do $block$
begin
  if exists(select 1 from public.vendor_invoices where vendor_id is null) then
    raise exception 'A6-F3B cannot activate: historical vendor_invoices contain unmapped canonical Vendors.';
  end if;
end;
$block$;