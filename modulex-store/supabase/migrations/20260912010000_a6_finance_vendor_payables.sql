-- A6 Vendor Payables / Order Settlement.
--
-- Existing-system-first boundaries:
--   * customer_order_items manual_vendor_cabinet rows remain commitment truth.
--   * vendor_invoices/vendor_invoice_lines remain AP source-document truth.
--   * vendor_invoice_payment_allocations remain invoice-payment truth.
--   * finance_transactions remains the only cash ledger.
-- This migration adds attribution only; it never creates a Product, Vendor Bill, or Finance transaction.

create schema if not exists private;

create table public.vendor_invoice_order_allocations (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.vendor_invoices(id) on update cascade on delete restrict,
  invoice_line_id uuid not null references public.vendor_invoice_lines(id) on update cascade on delete restrict,
  order_item_id uuid not null references public.customer_order_items(id) on update cascade on delete restrict,
  amount numeric(18,4) not null check (amount > 0),
  currency_code varchar(3) not null check (currency_code = upper(currency_code) and length(currency_code)=3),
  created_by uuid null references public.profiles(id) on delete set null,
  updated_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vendor_invoice_order_alloc_uq unique(invoice_line_id, order_item_id)
);

create index vendor_invoice_order_alloc_invoice_idx
  on public.vendor_invoice_order_allocations(invoice_id, invoice_line_id);
create index vendor_invoice_order_alloc_line_idx
  on public.vendor_invoice_order_allocations(invoice_line_id, order_item_id);
create index vendor_invoice_order_alloc_item_idx
  on public.vendor_invoice_order_allocations(order_item_id, invoice_id);
create index vendor_invoice_order_alloc_item_created_idx
  on public.vendor_invoice_order_allocations(order_item_id, created_at);

create table public.vendor_payment_order_allocations (
  id uuid primary key default gen_random_uuid(),
  invoice_payment_allocation_id uuid not null references public.vendor_invoice_payment_allocations(id) on update cascade on delete restrict,
  order_item_id uuid not null references public.customer_order_items(id) on update cascade on delete restrict,
  amount_delta numeric(18,4) not null check (amount_delta <> 0),
  currency_code varchar(3) not null check (currency_code = upper(currency_code) and length(currency_code)=3),
  reversal_of_allocation_id uuid null references public.vendor_payment_order_allocations(id) on update cascade on delete restrict,
  reason text null,
  actor_id uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint vendor_payment_order_alloc_shape check (
    (amount_delta > 0 and reversal_of_allocation_id is null)
    or (amount_delta < 0 and reversal_of_allocation_id is not null and nullif(btrim(coalesce(reason,'')),'') is not null)
  )
);

create unique index vendor_payment_order_alloc_reversal_uidx
  on public.vendor_payment_order_allocations(reversal_of_allocation_id)
  where reversal_of_allocation_id is not null;
create index vendor_payment_order_alloc_invoice_payment_idx
  on public.vendor_payment_order_allocations(invoice_payment_allocation_id, created_at);
create index vendor_payment_order_alloc_item_idx
  on public.vendor_payment_order_allocations(order_item_id, created_at);

alter table public.vendor_invoice_order_allocations enable row level security;
alter table public.vendor_payment_order_allocations enable row level security;

revoke all on public.vendor_invoice_order_allocations from public, anon, authenticated;
revoke all on public.vendor_payment_order_allocations from public, anon, authenticated;

comment on table public.vendor_invoice_order_allocations is
  'Draft-configured attribution of canonical Vendor Bill lines to productless Vendor Cabinet Order commitments.';
comment on table public.vendor_payment_order_allocations is
  'Append-only attribution of real Vendor Bill payment allocations to Vendor Cabinet Order commitments.';

create or replace function private.guard_vendor_payment_order_allocations_append_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  raise exception 'Vendor Payment Order settlement history is append-only.' using errcode='23514';
end;
$function$;

revoke all on function private.guard_vendor_payment_order_allocations_append_only() from public, anon, authenticated;

create trigger trg_vendor_payment_order_allocations_append_only
before update or delete on public.vendor_payment_order_allocations
for each row execute function private.guard_vendor_payment_order_allocations_append_only();

create or replace function private.guard_vendor_cabinet_finance_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if coalesce(old.pricing_model_snapshot,'') <> 'manual_vendor_cabinet'
     or not exists (
       select 1
       from public.vendor_invoice_order_allocations a
       where a.order_item_id=old.id
     ) then
    return case when tg_op='DELETE' then old else new end;
  end if;

  if tg_op='DELETE' then
    raise exception 'Vendor Cabinet line has Finance attribution and cannot be deleted.' using errcode='23514';
  end if;

  if new.order_id is distinct from old.order_id
     or new.product_id is distinct from old.product_id
     or new.pricing_model_snapshot is distinct from old.pricing_model_snapshot
     or new.vendor_id is distinct from old.vendor_id
     or new.manual_cost_amount is distinct from old.manual_cost_amount
     or new.cost_currency_code is distinct from old.cost_currency_code then
    raise exception 'Vendor Cabinet financial identity is locked after Vendor Bill attribution.' using errcode='23514';
  end if;

  return new;
end;
$function$;

revoke all on function private.guard_vendor_cabinet_finance_identity() from public, anon, authenticated;

drop trigger if exists customer_order_items_vendor_cabinet_finance_identity on public.customer_order_items;
create trigger customer_order_items_vendor_cabinet_finance_identity
before update or delete on public.customer_order_items
for each row execute function private.guard_vendor_cabinet_finance_identity();

create or replace function private.vendor_payables_validate_order_item(
  p_invoice_id uuid,
  p_invoice_line_id uuid,
  p_order_item_id uuid
)
returns public.customer_order_items
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_invoice public.vendor_invoices%rowtype;
  v_line public.vendor_invoice_lines%rowtype;
  v_item public.customer_order_items%rowtype;
  v_order public.customer_orders%rowtype;
begin
  select * into v_invoice
  from public.vendor_invoices
  where id=p_invoice_id
  for update;
  if v_invoice.id is null then raise exception 'Vendor Bill not found.' using errcode='23503'; end if;
  if v_invoice.status <> 'draft' then
    raise exception 'Vendor Bill Order allocations may change only while Draft.' using errcode='23514';
  end if;
  if v_invoice.vendor_id is null then
    raise exception 'Canonical Vendor is required before allocating a Vendor Bill.' using errcode='23514';
  end if;

  select * into v_line
  from public.vendor_invoice_lines
  where id=p_invoice_line_id
  for update;
  if v_line.id is null or v_line.invoice_id <> v_invoice.id then
    raise exception 'Vendor Bill line does not belong to this Vendor Bill.' using errcode='23514';
  end if;

  select * into v_item
  from public.customer_order_items
  where id=p_order_item_id
  for update;
  if v_item.id is null
     or v_item.product_id is not null
     or coalesce(v_item.pricing_model_snapshot,'') <> 'manual_vendor_cabinet' then
    raise exception 'Only productless Vendor Cabinet lines can receive Vendor Bill attribution.' using errcode='23514';
  end if;

  select * into v_order
  from public.customer_orders
  where id=v_item.order_id
  for update;
  if v_order.id is null then raise exception 'Customer Order not found.' using errcode='23503'; end if;
  if v_order.status in ('draft','cancelled') then
    raise exception 'Only committed, non-cancelled Vendor Cabinet Orders can receive Vendor Bill attribution.' using errcode='23514';
  end if;
  if v_item.vendor_id is distinct from v_invoice.vendor_id then
    raise exception 'Vendor Bill Vendor must match the Vendor Cabinet commitment Vendor.' using errcode='23514';
  end if;
  if v_item.cost_currency_code is null or v_item.cost_currency_code is distinct from v_invoice.currency_code then
    raise exception 'Vendor Bill currency must match the committed Vendor Cabinet cost currency.' using errcode='23514';
  end if;

  return v_item;
end;
$function$;

revoke all on function private.vendor_payables_validate_order_item(uuid,uuid,uuid) from public, anon, authenticated;

create or replace function private.set_vendor_invoice_order_allocations(
  p_invoice_id uuid,
  p_invoice_line_id uuid,
  p_allocations jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_invoice public.vendor_invoices%rowtype;
  v_line public.vendor_invoice_lines%rowtype;
  v_entry jsonb;
  v_item_id uuid;
  v_amount numeric(18,4);
  v_total numeric(18,4) := 0;
  v_count integer := 0;
begin
  perform private.finance_assert_manage();
  if p_invoice_id is null or p_invoice_line_id is null then
    raise exception 'Vendor Bill and line are required.' using errcode='22023';
  end if;
  if p_allocations is null or jsonb_typeof(p_allocations) <> 'array' then
    raise exception 'Vendor Bill Order allocations must be a JSON array.' using errcode='22023';
  end if;

  -- vendor_invoice_order_allocations capacity decisions are serialized by FOR UPDATE.
  select * into v_invoice from public.vendor_invoices where id=p_invoice_id for update;
  if v_invoice.id is null then raise exception 'Vendor Bill not found.' using errcode='23503'; end if;
  if v_invoice.status <> 'draft' then raise exception 'Vendor Bill Order allocations may change only while Draft.' using errcode='23514'; end if;
  select * into v_line from public.vendor_invoice_lines where id=p_invoice_line_id for update;
  if v_line.id is null or v_line.invoice_id<>v_invoice.id then raise exception 'Vendor Bill line does not belong to this Vendor Bill.' using errcode='23514'; end if;

  if exists (
    select 1
    from (
      select nullif(x.value->>'order_item_id','')::uuid as order_item_id,count(*)
      from jsonb_array_elements(p_allocations) x(value)
      group by nullif(x.value->>'order_item_id','')::uuid
      having count(*)>1
    ) d
  ) then
    raise exception 'A Vendor Cabinet commitment can appear only once per Vendor Bill line.' using errcode='23514';
  end if;

  for v_entry in select value from jsonb_array_elements(p_allocations)
  loop
    begin
      v_item_id := nullif(v_entry->>'order_item_id','')::uuid;
      v_amount := round((v_entry->>'amount')::numeric,4);
    exception when others then
      raise exception 'Each Vendor Bill Order allocation requires a valid order_item_id and amount.' using errcode='22023';
    end;
    if v_item_id is null or v_amount is null or v_amount<=0 then
      raise exception 'Each Vendor Bill Order allocation requires a positive amount.' using errcode='22023';
    end if;
    perform private.vendor_payables_validate_order_item(p_invoice_id,p_invoice_line_id,v_item_id);
    v_total := round(v_total+v_amount,4);
    v_count := v_count+1;
  end loop;

  if v_total > v_line.amount then
    raise exception 'Vendor Bill Order allocations cannot exceed the Vendor Bill line amount.' using errcode='23514';
  end if;

  delete from public.vendor_invoice_order_allocations
  where invoice_line_id=p_invoice_line_id;

  for v_entry in select value from jsonb_array_elements(p_allocations)
  loop
    v_item_id := (v_entry->>'order_item_id')::uuid;
    v_amount := round((v_entry->>'amount')::numeric,4);
    insert into public.vendor_invoice_order_allocations(
      invoice_id,invoice_line_id,order_item_id,amount,currency_code,created_by,updated_by
    ) values (
      v_invoice.id,v_line.id,v_item_id,v_amount,v_invoice.currency_code,auth.uid(),auth.uid()
    );
  end loop;

  perform private.vendor_invoice_write_audit(
    v_invoice.id,
    'order_allocations_set',
    null,
    jsonb_build_object('invoice_line_id',v_line.id,'allocations',p_allocations),
    null
  );
  return v_count;
end;
$function$;

revoke all on function private.set_vendor_invoice_order_allocations(uuid,uuid,jsonb) from public, anon, authenticated;

create or replace function public.set_vendor_invoice_order_allocations(
  p_invoice_id uuid,
  p_invoice_line_id uuid,
  p_allocations jsonb
)
returns integer
language sql
security definer
set search_path = ''
as $function$
  select private.set_vendor_invoice_order_allocations($1,$2,$3);
$function$;

revoke all on function public.set_vendor_invoice_order_allocations(uuid,uuid,jsonb) from public, anon;
grant execute on function public.set_vendor_invoice_order_allocations(uuid,uuid,jsonb) to authenticated;

create or replace function private.vendor_order_commitment_summary(p_order_item_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  with invoice_totals as (
    select
      a.order_item_id,
      round(coalesce(sum(a.amount) filter (where vi.status='open'),0),4) as invoiced_amount,
      count(distinct vi.id) filter (where vi.status='open') as invoice_count
    from public.vendor_invoice_order_allocations a
    join public.vendor_invoices vi on vi.id=a.invoice_id
    where a.order_item_id=$1
    group by a.order_item_id
  ), payment_by_source as (
    select
      po.order_item_id,
      po.invoice_payment_allocation_id,
      round(sum(po.amount_delta),4) as net_amount
    from public.vendor_payment_order_allocations po
    join public.vendor_invoice_payment_allocations ipa on ipa.id=po.invoice_payment_allocation_id
    join public.vendor_invoices vi on vi.id=ipa.invoice_id and vi.status='open'
    where po.order_item_id=$1
    group by po.order_item_id,po.invoice_payment_allocation_id
  ), payment_totals as (
    select order_item_id,round(coalesce(sum(net_amount),0),4) as paid_amount,
      count(*) filter (where net_amount>0) as payment_count
    from payment_by_source
    group by order_item_id
  )
  select to_jsonb(x)
  from (
    select
      oi.id as order_item_id,
      o.customer_id,
      oi.vendor_id,
      v.code as vendor_code,
      coalesce(nullif(btrim(v.display_name),''),v.legal_name,oi.vendor_name_snapshot) as vendor_name,
      o.project_id,
      p.project_number,
      p.name as project_name,
      o.id as order_id,
      o.order_number,
      o.status as order_status,
      coalesce(nullif(btrim(oi.display_name_override),''),oi.product_name_snapshot) as line_description,
      oi.source_document_id,
      round(coalesce(oi.manual_cost_amount,0),4) as committed_amount,
      coalesce(oi.cost_currency_code,o.currency_code)::varchar(3) as currency_code,
      round(coalesce(it.invoiced_amount,0),4) as invoiced_amount,
      round(coalesce(pt.paid_amount,0),4) as paid_amount,
      round(greatest(coalesce(oi.manual_cost_amount,0)-coalesce(it.invoiced_amount,0),0),4) as uninvoiced_amount,
      round(greatest(coalesce(it.invoiced_amount,0)-coalesce(pt.paid_amount,0),0),4) as invoiced_outstanding_amount,
      round(
        greatest(coalesce(oi.manual_cost_amount,0)-coalesce(it.invoiced_amount,0),0)
        + greatest(coalesce(it.invoiced_amount,0)-coalesce(pt.paid_amount,0),0),4
      ) as remaining_exposure,
      round(coalesce(it.invoiced_amount,0)-coalesce(oi.manual_cost_amount,0),4) as invoice_variance,
      coalesce(it.invoice_count,0)::bigint as invoice_count,
      coalesce(pt.payment_count,0)::bigint as payment_count,
      case when o.status='cancelled' then 'cancelled' when o.status='draft' then 'planned' else 'committed' end as commitment_status,
      case
        when coalesce(it.invoiced_amount,0)<=0 then 'not_invoiced'
        when coalesce(it.invoiced_amount,0)<coalesce(oi.manual_cost_amount,0) then 'partially_invoiced'
        else 'invoiced'
      end as invoice_status,
      case
        when coalesce(pt.paid_amount,0)<=0 then 'unpaid'
        when coalesce(it.invoiced_amount,0)>0 and coalesce(pt.paid_amount,0)>=coalesce(it.invoiced_amount,0) then 'paid'
        else 'partially_paid'
      end as payment_status,
      o.order_date,
      oi.created_at
    from public.customer_order_items oi
    join public.customer_orders o on o.id=oi.order_id
    left join public.customer_projects p on p.id=o.project_id
    left join public.vendors v on v.id=oi.vendor_id
    left join invoice_totals it on it.order_item_id=oi.id
    left join payment_totals pt on pt.order_item_id=oi.id
    where oi.id=$1
      and oi.product_id is null
      and oi.pricing_model_snapshot='manual_vendor_cabinet'
      and oi.vendor_id is not null
      and oi.manual_cost_amount is not null
  ) x;
$function$;

revoke all on function private.vendor_order_commitment_summary(uuid) from public, anon, authenticated;

create or replace function private.get_vendor_order_commitments_page(
  p_limit integer default 50,
  p_offset integer default 0,
  p_vendor_id uuid default null,
  p_commitment_status text default null,
  p_invoice_status text default null,
  p_payment_status text default null,
  p_project_id uuid default null,
  p_order_id uuid default null,
  p_search text default null
)
returns table(
  order_item_id uuid,
  customer_id uuid,
  vendor_id uuid,
  vendor_code text,
  vendor_name text,
  project_id uuid,
  project_number text,
  project_name text,
  order_id uuid,
  order_number text,
  order_status text,
  line_description text,
  source_document_id uuid,
  committed_amount numeric,
  currency_code varchar,
  invoiced_amount numeric,
  paid_amount numeric,
  uninvoiced_amount numeric,
  invoiced_outstanding_amount numeric,
  remaining_exposure numeric,
  invoice_variance numeric,
  invoice_count bigint,
  payment_count bigint,
  commitment_status text,
  invoice_status text,
  payment_status text,
  order_date date,
  created_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  perform private.finance_assert_view();
  return query
  with invoice_totals as (
    select
      a.order_item_id,
      round(coalesce(sum(a.amount) filter (where vi.status='open'),0),4) as invoiced_amount,
      count(distinct vi.id) filter (where vi.status='open') as invoice_count
    from public.vendor_invoice_order_allocations a
    join public.vendor_invoices vi on vi.id=a.invoice_id
    group by a.order_item_id
  ), payment_by_source as (
    select
      po.order_item_id,
      po.invoice_payment_allocation_id,
      round(sum(po.amount_delta),4) as net_amount
    from public.vendor_payment_order_allocations po
    join public.vendor_invoice_payment_allocations ipa on ipa.id=po.invoice_payment_allocation_id
    join public.vendor_invoices vi on vi.id=ipa.invoice_id and vi.status='open'
    group by po.order_item_id,po.invoice_payment_allocation_id
  ), payment_totals as (
    select order_item_id,round(coalesce(sum(net_amount),0),4) as paid_amount,
      count(*) filter (where net_amount>0) as payment_count
    from payment_by_source
    group by order_item_id
  ), rows as (
    select
      oi.id as order_item_id,
      o.customer_id,
      oi.vendor_id,
      v.code as vendor_code,
      coalesce(nullif(btrim(v.display_name),''),v.legal_name,oi.vendor_name_snapshot) as vendor_name,
      o.project_id,
      p.project_number,
      p.name as project_name,
      o.id as order_id,
      o.order_number,
      o.status as order_status,
      coalesce(nullif(btrim(oi.display_name_override),''),oi.product_name_snapshot) as line_description,
      oi.source_document_id,
      round(coalesce(oi.manual_cost_amount,0),4) as committed_amount,
      coalesce(oi.cost_currency_code,o.currency_code)::varchar as currency_code,
      round(coalesce(it.invoiced_amount,0),4) as invoiced_amount,
      round(coalesce(pt.paid_amount,0),4) as paid_amount,
      round(greatest(coalesce(oi.manual_cost_amount,0)-coalesce(it.invoiced_amount,0),0),4) as uninvoiced_amount,
      round(greatest(coalesce(it.invoiced_amount,0)-coalesce(pt.paid_amount,0),0),4) as invoiced_outstanding_amount,
      round(
        greatest(coalesce(oi.manual_cost_amount,0)-coalesce(it.invoiced_amount,0),0)
        + greatest(coalesce(it.invoiced_amount,0)-coalesce(pt.paid_amount,0),0),4
      ) as remaining_exposure,
      round(coalesce(it.invoiced_amount,0)-coalesce(oi.manual_cost_amount,0),4) as invoice_variance,
      coalesce(it.invoice_count,0)::bigint as invoice_count,
      coalesce(pt.payment_count,0)::bigint as payment_count,
      case when o.status='cancelled' then 'cancelled' when o.status='draft' then 'planned' else 'committed' end as commitment_status,
      case
        when coalesce(it.invoiced_amount,0)<=0 then 'not_invoiced'
        when coalesce(it.invoiced_amount,0)<coalesce(oi.manual_cost_amount,0) then 'partially_invoiced'
        else 'invoiced'
      end as invoice_status,
      case
        when coalesce(pt.paid_amount,0)<=0 then 'unpaid'
        when coalesce(it.invoiced_amount,0)>0 and coalesce(pt.paid_amount,0)>=coalesce(it.invoiced_amount,0) then 'paid'
        else 'partially_paid'
      end as payment_status,
      o.order_date,
      oi.created_at
    from public.customer_order_items oi
    join public.customer_orders o on o.id=oi.order_id
    left join public.customer_projects p on p.id=o.project_id
    left join public.vendors v on v.id=oi.vendor_id
    left join invoice_totals it on it.order_item_id=oi.id
    left join payment_totals pt on pt.order_item_id=oi.id
    where oi.product_id is null
      and oi.pricing_model_snapshot='manual_vendor_cabinet'
      and oi.vendor_id is not null
      and oi.manual_cost_amount is not null
  )
  select r.*,count(*) over() as total_count
  from rows r
  where (p_vendor_id is null or r.vendor_id=p_vendor_id)
    and (p_commitment_status is null or r.commitment_status=p_commitment_status)
    and (p_invoice_status is null or r.invoice_status=p_invoice_status)
    and (p_payment_status is null or r.payment_status=p_payment_status)
    and (p_project_id is null or r.project_id=p_project_id)
    and (p_order_id is null or r.order_id=p_order_id)
    and (
      nullif(btrim(coalesce(p_search,'')),'') is null
      or r.vendor_name ilike '%'||btrim(p_search)||'%'
      or r.vendor_code ilike '%'||btrim(p_search)||'%'
      or r.order_number ilike '%'||btrim(p_search)||'%'
      or coalesce(r.project_number,'') ilike '%'||btrim(p_search)||'%'
      or coalesce(r.project_name,'') ilike '%'||btrim(p_search)||'%'
      or r.line_description ilike '%'||btrim(p_search)||'%'
    )
  order by
    case r.commitment_status when 'committed' then 0 when 'planned' then 1 else 2 end,
    r.order_date desc,r.order_number,r.order_item_id
  limit least(greatest(coalesce(p_limit,50),1),200)
  offset greatest(coalesce(p_offset,0),0);
end;
$function$;

revoke all on function private.get_vendor_order_commitments_page(integer,integer,uuid,text,text,text,uuid,uuid,text) from public, anon, authenticated;

create or replace function public.get_vendor_order_commitments_page(
  p_limit integer default 50,
  p_offset integer default 0,
  p_vendor_id uuid default null,
  p_commitment_status text default null,
  p_invoice_status text default null,
  p_payment_status text default null,
  p_project_id uuid default null,
  p_order_id uuid default null,
  p_search text default null
)
returns table(
  order_item_id uuid,
  customer_id uuid,
  vendor_id uuid,
  vendor_code text,
  vendor_name text,
  project_id uuid,
  project_number text,
  project_name text,
  order_id uuid,
  order_number text,
  order_status text,
  line_description text,
  source_document_id uuid,
  committed_amount numeric,
  currency_code varchar,
  invoiced_amount numeric,
  paid_amount numeric,
  uninvoiced_amount numeric,
  invoiced_outstanding_amount numeric,
  remaining_exposure numeric,
  invoice_variance numeric,
  invoice_count bigint,
  payment_count bigint,
  commitment_status text,
  invoice_status text,
  payment_status text,
  order_date date,
  created_at timestamptz,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $function$
  select * from private.get_vendor_order_commitments_page($1,$2,$3,$4,$5,$6,$7,$8,$9);
$function$;

revoke all on function public.get_vendor_order_commitments_page(integer,integer,uuid,text,text,text,uuid,uuid,text) from public, anon;
grant execute on function public.get_vendor_order_commitments_page(integer,integer,uuid,text,text,text,uuid,uuid,text) to authenticated;

create or replace function private.get_vendor_order_commitment_detail(p_order_item_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_summary jsonb;
begin
  perform private.finance_assert_view();
  v_summary := private.vendor_order_commitment_summary(p_order_item_id);
  if v_summary is null then raise exception 'Vendor Cabinet commitment not found.' using errcode='23503'; end if;

  return jsonb_build_object(
    'commitment',v_summary,
    'bill_allocations',coalesce((
      select jsonb_agg(
        to_jsonb(a)||jsonb_build_object(
          'invoice_number',vi.invoice_number,
          'invoice_status',vi.status,
          'invoice_date',vi.invoice_date,
          'due_date',vi.due_date,
          'line_no',vl.line_no,
          'line_description',vl.description
        ) order by vi.invoice_date,vi.invoice_number,vl.line_no,a.id
      )
      from public.vendor_invoice_order_allocations a
      join public.vendor_invoices vi on vi.id=a.invoice_id
      join public.vendor_invoice_lines vl on vl.id=a.invoice_line_id
      where a.order_item_id=p_order_item_id and vi.status='open'
    ),'[]'::jsonb),
    'draft_allocations',coalesce((
      select jsonb_agg(
        to_jsonb(a)||jsonb_build_object(
          'invoice_number',vi.invoice_number,
          'invoice_status',vi.status,
          'line_no',vl.line_no,
          'line_description',vl.description
        ) order by vi.created_at,vl.line_no,a.id
      )
      from public.vendor_invoice_order_allocations a
      join public.vendor_invoices vi on vi.id=a.invoice_id
      join public.vendor_invoice_lines vl on vl.id=a.invoice_line_id
      where a.order_item_id=p_order_item_id and vi.status='draft'
    ),'[]'::jsonb),
    'settlements',coalesce((
      select jsonb_agg(
        to_jsonb(po)||jsonb_build_object(
          'invoice_id',ipa.invoice_id,
          'invoice_number',vi.invoice_number,
          'finance_transaction_id',ipa.finance_transaction_id,
          'transaction_at',ft.transaction_at,
          'transaction_status',ft.status,
          'transaction_reference',ft.reference_no
        ) order by po.created_at,po.id
      )
      from public.vendor_payment_order_allocations po
      join public.vendor_invoice_payment_allocations ipa on ipa.id=po.invoice_payment_allocation_id
      join public.vendor_invoices vi on vi.id=ipa.invoice_id
      join public.finance_transactions ft on ft.id=ipa.finance_transaction_id
      where po.order_item_id=p_order_item_id
    ),'[]'::jsonb),
    'source_document',(
      select jsonb_build_object(
        'id',d.id,'file_name',d.file_name,'storage_bucket',d.storage_bucket,'storage_path',d.storage_path,
        'mime_type',d.mime_type,'file_size_bytes',d.file_size_bytes,'is_active',d.is_active
      )
      from public.customer_order_items oi
      join public.entity_documents d on d.id=oi.source_document_id
      where oi.id=p_order_item_id
    )
  );
end;
$function$;

revoke all on function private.get_vendor_order_commitment_detail(uuid) from public, anon, authenticated;

create or replace function public.get_vendor_order_commitment_detail(p_order_item_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select private.get_vendor_order_commitment_detail($1);
$function$;

revoke all on function public.get_vendor_order_commitment_detail(uuid) from public, anon;
grant execute on function public.get_vendor_order_commitment_detail(uuid) to authenticated;

create or replace function private.get_vendor_invoice_commitment_reference_data(p_invoice_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_invoice public.vendor_invoices%rowtype;
begin
  perform private.finance_assert_view();
  select * into v_invoice from public.vendor_invoices where id=p_invoice_id;
  if v_invoice.id is null then raise exception 'Vendor Bill not found.' using errcode='23503'; end if;

  return jsonb_build_object(
    'invoice',to_jsonb(v_invoice),
    'lines',coalesce((
      select jsonb_agg(to_jsonb(l) order by l.line_no,l.id)
      from public.vendor_invoice_lines l where l.invoice_id=p_invoice_id
    ),'[]'::jsonb),
    'allocations',coalesce((
      select jsonb_agg(
        to_jsonb(a)||jsonb_build_object(
          'order_number',o.order_number,
          'project_id',o.project_id,
          'project_number',p.project_number,
          'project_name',p.name,
          'line_description',coalesce(nullif(btrim(oi.display_name_override),''),oi.product_name_snapshot)
        ) order by a.invoice_line_id,o.order_number,a.id
      )
      from public.vendor_invoice_order_allocations a
      join public.customer_order_items oi on oi.id=a.order_item_id
      join public.customer_orders o on o.id=oi.order_id
      left join public.customer_projects p on p.id=o.project_id
      where a.invoice_id=p_invoice_id
    ),'[]'::jsonb),
    'candidates',coalesce((
      select jsonb_agg(c order by c.order_date desc,c.order_number,c.order_item_id)
      from (
        select
          oi.id as order_item_id,
          o.id as order_id,
          o.order_number,
          o.project_id,
          p.project_number,
          p.name as project_name,
          coalesce(nullif(btrim(oi.display_name_override),''),oi.product_name_snapshot) as line_description,
          round(oi.manual_cost_amount,4) as committed_amount,
          oi.cost_currency_code as currency_code,
          round(coalesce((
            select sum(a2.amount)
            from public.vendor_invoice_order_allocations a2
            join public.vendor_invoices vi2 on vi2.id=a2.invoice_id and vi2.status='open'
            where a2.order_item_id=oi.id
          ),0),4) as already_invoiced_amount,
          round(greatest(oi.manual_cost_amount-coalesce((
            select sum(a3.amount)
            from public.vendor_invoice_order_allocations a3
            join public.vendor_invoices vi3 on vi3.id=a3.invoice_id and vi3.status='open'
            where a3.order_item_id=oi.id
          ),0),0),4) as available_amount,
          o.order_date
        from public.customer_order_items oi
        join public.customer_orders o on o.id=oi.order_id
        left join public.customer_projects p on p.id=o.project_id
        where oi.product_id is null
          and oi.pricing_model_snapshot='manual_vendor_cabinet'
          and oi.vendor_id=v_invoice.vendor_id
          and oi.cost_currency_code=v_invoice.currency_code
          and o.status not in ('draft','cancelled')
      ) c
    ),'[]'::jsonb)
  );
end;
$function$;

revoke all on function private.get_vendor_invoice_commitment_reference_data(uuid) from public, anon, authenticated;

create or replace function public.get_vendor_invoice_commitment_reference_data(p_invoice_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select private.get_vendor_invoice_commitment_reference_data($1);
$function$;

revoke all on function public.get_vendor_invoice_commitment_reference_data(uuid) from public, anon;
grant execute on function public.get_vendor_invoice_commitment_reference_data(uuid) to authenticated;

create or replace function private.allocate_vendor_payment_to_orders(
  p_invoice_payment_allocation_id uuid,
  p_allocations jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_payment public.vendor_invoice_payment_allocations%rowtype;
  v_invoice public.vendor_invoices%rowtype;
  v_tx public.finance_transactions%rowtype;
  v_entry jsonb;
  v_item_id uuid;
  v_amount numeric(18,4);
  v_request_total numeric(18,4):=0;
  v_existing_source_total numeric(18,4);
  v_invoiced_to_item numeric(18,4);
  v_settled_to_item numeric(18,4);
  v_count integer:=0;
begin
  perform private.finance_assert_manage();
  if p_invoice_payment_allocation_id is null then raise exception 'Vendor Bill payment allocation is required.' using errcode='22023'; end if;
  if p_allocations is null or jsonb_typeof(p_allocations)<>'array' then raise exception 'Order settlement allocations must be a JSON array.' using errcode='22023'; end if;

  select * into v_payment
  from public.vendor_invoice_payment_allocations
  where id=p_invoice_payment_allocation_id
  for update;
  if v_payment.id is null or v_payment.amount_delta<=0 then
    raise exception 'A positive Vendor Bill payment allocation is required.' using errcode='23503';
  end if;
  if exists(select 1 from public.vendor_invoice_payment_allocations r where r.reversal_of_allocation_id=v_payment.id) then
    raise exception 'Reversed Vendor Bill payment allocations cannot settle Orders.' using errcode='23514';
  end if;

  select * into v_invoice from public.vendor_invoices where id=v_payment.invoice_id for update;
  if v_invoice.id is null or v_invoice.status<>'open' then raise exception 'Order settlement requires an Open Vendor Bill.' using errcode='23514'; end if;
  select * into v_tx from public.finance_transactions where id=v_payment.finance_transaction_id for update;
  if v_tx.id is null or v_tx.status<>'posted' or v_tx.transaction_kind<>'vendor_payment' then
    raise exception 'Order settlement requires a posted Vendor Payment.' using errcode='23514';
  end if;

  if exists (
    select 1 from (
      select nullif(x.value->>'order_item_id','')::uuid as order_item_id,count(*)
      from jsonb_array_elements(p_allocations) x(value)
      group by nullif(x.value->>'order_item_id','')::uuid
      having count(*)>1
    ) d
  ) then raise exception 'An Order commitment can appear only once per settlement request.' using errcode='23514'; end if;

  select round(coalesce(sum(amount_delta),0),4) into v_existing_source_total
  from public.vendor_payment_order_allocations
  where invoice_payment_allocation_id=v_payment.id;

  for v_entry in select value from jsonb_array_elements(p_allocations)
  loop
    begin
      v_item_id := nullif(v_entry->>'order_item_id','')::uuid;
      v_amount := round((v_entry->>'amount')::numeric,4);
    exception when others then
      raise exception 'Each Order settlement requires a valid order_item_id and amount.' using errcode='22023';
    end;
    if v_item_id is null or v_amount is null or v_amount<=0 then raise exception 'Each Order settlement amount must be positive.' using errcode='22023'; end if;

    if not exists(
      select 1
      from public.vendor_invoice_order_allocations a
      join public.customer_order_items oi on oi.id=a.order_item_id
      where a.invoice_id=v_invoice.id and a.order_item_id=v_item_id
        and oi.vendor_id=v_invoice.vendor_id and a.currency_code=v_payment.currency_code
    ) then
      raise exception 'Order settlement requires matching Vendor Bill attribution for the same Vendor and currency.' using errcode='23514';
    end if;

    select round(coalesce(sum(a.amount),0),4) into v_invoiced_to_item
    from public.vendor_invoice_order_allocations a
    where a.invoice_id=v_invoice.id and a.order_item_id=v_item_id;

    select round(coalesce(sum(po.amount_delta),0),4) into v_settled_to_item
    from public.vendor_payment_order_allocations po
    join public.vendor_invoice_payment_allocations ipa on ipa.id=po.invoice_payment_allocation_id
    where ipa.invoice_id=v_invoice.id and po.order_item_id=v_item_id;

    if v_settled_to_item+v_amount > v_invoiced_to_item then
      raise exception 'Order settlement cannot exceed the amount invoiced to that commitment.' using errcode='23514';
    end if;
    v_request_total:=round(v_request_total+v_amount,4);
    v_count:=v_count+1;
  end loop;

  if v_existing_source_total+v_request_total > v_payment.amount_delta then
    raise exception 'Order settlements cannot exceed the valid Vendor Bill payment allocation.' using errcode='23514';
  end if;

  for v_entry in select value from jsonb_array_elements(p_allocations)
  loop
    v_item_id := (v_entry->>'order_item_id')::uuid;
    v_amount := round((v_entry->>'amount')::numeric,4);
    insert into public.vendor_payment_order_allocations(
      invoice_payment_allocation_id,order_item_id,amount_delta,currency_code,actor_id
    ) values (
      v_payment.id,v_item_id,v_amount,v_payment.currency_code,auth.uid()
    );
  end loop;

  perform private.vendor_invoice_write_audit(
    v_invoice.id,
    'order_settlement_allocate',
    null,
    jsonb_build_object('invoice_payment_allocation_id',v_payment.id,'allocations',p_allocations),
    null
  );
  return v_count;
end;
$function$;

revoke all on function private.allocate_vendor_payment_to_orders(uuid,jsonb) from public, anon, authenticated;

create or replace function public.allocate_vendor_payment_to_orders(
  p_invoice_payment_allocation_id uuid,
  p_allocations jsonb
)
returns integer
language sql
security definer
set search_path = ''
as $function$
  select private.allocate_vendor_payment_to_orders($1,$2);
$function$;

revoke all on function public.allocate_vendor_payment_to_orders(uuid,jsonb) from public, anon;
grant execute on function public.allocate_vendor_payment_to_orders(uuid,jsonb) to authenticated;

create or replace function private.reverse_vendor_payment_order_allocations_for_invoice_allocation(
  p_invoice_payment_allocation_id uuid,
  p_reason text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_row public.vendor_payment_order_allocations%rowtype;
  v_count integer:=0;
begin
  if nullif(btrim(coalesce(p_reason,'')),'') is null then
    raise exception 'Order settlement reversal reason is required.' using errcode='22023';
  end if;

  for v_row in
    select po.*
    from public.vendor_payment_order_allocations po
    where po.invoice_payment_allocation_id=p_invoice_payment_allocation_id
      and po.amount_delta>0
      and not exists(
        select 1 from public.vendor_payment_order_allocations r
        where r.reversal_of_allocation_id=po.id
      )
    order by po.created_at,po.id
    for update
  loop
    insert into public.vendor_payment_order_allocations(
      invoice_payment_allocation_id,order_item_id,amount_delta,currency_code,
      reversal_of_allocation_id,reason,actor_id
    ) values (
      v_row.invoice_payment_allocation_id,v_row.order_item_id,-v_row.amount_delta,v_row.currency_code,
      v_row.id,btrim(p_reason),auth.uid()
    );
    v_count:=v_count+1;
  end loop;
  return v_count;
end;
$function$;

revoke all on function private.reverse_vendor_payment_order_allocations_for_invoice_allocation(uuid,text) from public, anon, authenticated;

-- Preserve the existing public/private reversal signature. The only behavioral extension is
-- atomic reversal of child Order settlements before the invoice-level negative allocation row.
create or replace function private.reverse_vendor_invoice_payment_allocation(
  p_allocation_id uuid,
  p_reversal_finance_transaction_id uuid,
  p_reason text,
  p_idempotency_key uuid default null::uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_original public.vendor_invoice_payment_allocations%rowtype;
  v_tx public.finance_transactions%rowtype;
  v_id uuid;
  v_existing uuid;
  v_fingerprint text;
begin
  perform private.finance_assert_manage();
  if nullif(btrim(coalesce(p_reason,'')),'') is null then
    raise exception 'Payment allocation reversal reason is required.' using errcode='22023';
  end if;
  v_fingerprint:=md5(jsonb_build_object(
    'allocation',p_allocation_id,
    'reversal_transaction',p_reversal_finance_transaction_id,
    'reason',btrim(p_reason)
  )::text);
  v_existing:=private.vendor_invoice_idempotency_existing('payment_allocation_reverse',p_idempotency_key,v_fingerprint);
  if v_existing is not null then return v_existing; end if;

  select * into v_original
  from public.vendor_invoice_payment_allocations
  where id=p_allocation_id
  for update;
  if v_original.id is null or v_original.amount_delta<=0 then
    raise exception 'Original positive Vendor Bill payment allocation not found.' using errcode='23503';
  end if;
  if exists(select 1 from public.vendor_invoice_payment_allocations r where r.reversal_of_allocation_id=v_original.id) then
    raise exception 'Vendor Bill payment allocation has already been reversed.' using errcode='23514';
  end if;

  select * into v_tx from public.finance_transactions where id=p_reversal_finance_transaction_id;
  if v_tx.id is null or v_tx.status<>'posted' or v_tx.transaction_kind<>'reversal'
     or v_tx.reversal_of_transaction_id<>v_original.finance_transaction_id then
    raise exception 'Allocation reversal requires the posted Finance reversal of the original vendor payment.' using errcode='23514';
  end if;

  perform private.reverse_vendor_payment_order_allocations_for_invoice_allocation(v_original.id,p_reason);

  insert into public.vendor_invoice_payment_allocations(
    invoice_id,finance_transaction_id,amount_delta,currency_code,reversal_of_allocation_id,reason,actor_id
  ) values (
    v_original.invoice_id,p_reversal_finance_transaction_id,-v_original.amount_delta,v_original.currency_code,
    v_original.id,btrim(p_reason),auth.uid()
  ) returning id into v_id;

  perform private.vendor_invoice_write_audit(
    v_original.invoice_id,'payment_allocation_reverse',to_jsonb(v_original),
    (select to_jsonb(a) from public.vendor_invoice_payment_allocations a where a.id=v_id),p_reason
  );
  perform private.vendor_invoice_store_idempotency(
    'payment_allocation_reverse',p_idempotency_key,v_fingerprint,v_id,'payment_allocation'
  );
  return v_id;
end;
$function$;

revoke all on function private.reverse_vendor_invoice_payment_allocation(uuid,uuid,text,uuid) from public, anon, authenticated;

-- Extend existing Vendor Bill detail without removing any established keys.
create or replace function private.get_vendor_invoice_detail(p_invoice_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_invoice public.vendor_invoices%rowtype;
  v_paid numeric;
begin
  perform private.finance_assert_view();
  select * into v_invoice from public.vendor_invoices where id=p_invoice_id;
  if v_invoice.id is null then raise exception 'Vendor Bill not found.' using errcode='23503'; end if;
  v_paid := private.vendor_invoice_paid_amount(p_invoice_id);
  return jsonb_build_object(
    'invoice',to_jsonb(v_invoice)||jsonb_build_object(
      'payment_status',private.vendor_invoice_payment_state(p_invoice_id),
      'paid_amount',v_paid,
      'outstanding_amount',greatest(v_invoice.total_amount-v_paid,0)
    ),
    'vendor',(select to_jsonb(v) from public.vendors v where v.id=v_invoice.vendor_id),
    'lines',coalesce((select jsonb_agg(to_jsonb(l) order by l.line_no) from public.vendor_invoice_lines l where l.invoice_id=p_invoice_id),'[]'::jsonb),
    'procurement_allocations',coalesce((
      select jsonb_agg(to_jsonb(a)||jsonb_build_object('vendor_order_no',c.vendor_order_no,'order_id',c.order_id) order by a.created_at,a.id)
      from public.customer_project_procurement_invoice_allocations a
      join public.customer_project_procurement_commitments c on c.id=a.commitment_id
      where a.invoice_id=p_invoice_id
    ),'[]'::jsonb),
    'payment_allocations',coalesce((
      select jsonb_agg(to_jsonb(a)||jsonb_build_object(
        'transaction_kind',t.transaction_kind,'transaction_status',t.status,
        'transaction_at',t.transaction_at,'reference_no',t.reference_no
      ) order by a.created_at,a.id)
      from public.vendor_invoice_payment_allocations a
      join public.finance_transactions t on t.id=a.finance_transaction_id
      where a.invoice_id=p_invoice_id
    ),'[]'::jsonb),
    'order_allocations',coalesce((
      select jsonb_agg(to_jsonb(a)||jsonb_build_object(
        'invoice_line_no',vl.line_no,
        'order_id',o.id,'order_number',o.order_number,
        'project_id',o.project_id,'project_number',p.project_number,'project_name',p.name,
        'line_description',coalesce(nullif(btrim(oi.display_name_override),''),oi.product_name_snapshot)
      ) order by vl.line_no,o.order_number,a.id)
      from public.vendor_invoice_order_allocations a
      join public.vendor_invoice_lines vl on vl.id=a.invoice_line_id
      join public.customer_order_items oi on oi.id=a.order_item_id
      join public.customer_orders o on o.id=oi.order_id
      left join public.customer_projects p on p.id=o.project_id
      where a.invoice_id=p_invoice_id
    ),'[]'::jsonb),
    'order_settlements',coalesce((
      select jsonb_agg(to_jsonb(po)||jsonb_build_object(
        'invoice_payment_allocation_id',ipa.id,
        'finance_transaction_id',ipa.finance_transaction_id,
        'order_number',o.order_number,
        'line_description',coalesce(nullif(btrim(oi.display_name_override),''),oi.product_name_snapshot)
      ) order by po.created_at,po.id)
      from public.vendor_payment_order_allocations po
      join public.vendor_invoice_payment_allocations ipa on ipa.id=po.invoice_payment_allocation_id
      join public.customer_order_items oi on oi.id=po.order_item_id
      join public.customer_orders o on o.id=oi.order_id
      where ipa.invoice_id=p_invoice_id
    ),'[]'::jsonb),
    'audit',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at,a.id) from public.vendor_invoice_audit a where a.invoice_id=p_invoice_id),'[]'::jsonb)
  );
end;
$function$;

revoke all on function private.get_vendor_invoice_detail(uuid) from public, anon, authenticated;

-- Keep all private mutation/read cores unavailable to browser roles.
revoke all on function private.get_vendor_order_commitments_page(integer,integer,uuid,text,text,text,uuid,uuid,text) from public, anon, authenticated;
revoke all on function private.get_vendor_order_commitment_detail(uuid) from public, anon, authenticated;
revoke all on function private.get_vendor_invoice_commitment_reference_data(uuid) from public, anon, authenticated;
revoke all on function private.set_vendor_invoice_order_allocations(uuid,uuid,jsonb) from public, anon, authenticated;
revoke all on function private.allocate_vendor_payment_to_orders(uuid,jsonb) from public, anon, authenticated;
revoke all on function private.reverse_vendor_payment_order_allocations_for_invoice_allocation(uuid,text) from public, anon, authenticated;
