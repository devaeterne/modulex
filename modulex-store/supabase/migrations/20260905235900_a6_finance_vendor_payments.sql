-- A6-F3C: Vendor Payments + Check / Payment Instrument Lifecycle.
-- Existing-system-first rules:
--   * finance_transactions(transaction_kind='vendor_payment') remains the only money-movement ledger.
--   * payment_methods remains canonical configuration; F3C only ensures Check exists.
--   * vendor_invoice_payment_allocations remains the F3B bill settlement allocation truth.
--   * finance_payment_instruments is NEW only because no financial instrument lifecycle exists.
--   * scheduled_payment_date intentionally remains A6-F3D.

create schema if not exists private;

-- Canonical payment method extension. Do not create a second payment-method table.
insert into public.payment_methods(system_key,name,sort_order,is_active)
values ('check','Check',40,true)
on conflict (system_key) do nothing;

alter table public.finance_transactions
  add column if not exists payment_method_id uuid references public.payment_methods(id) on update cascade on delete restrict;
create index if not exists finance_transactions_payment_method_idx
  on public.finance_transactions(payment_method_id) where payment_method_id is not null;

create table public.finance_payment_instruments (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.finance_transactions(id) on update cascade on delete restrict,
  payment_method_id uuid not null references public.payment_methods(id) on update cascade on delete restrict,
  instrument_type text not null check (instrument_type in ('check')),
  instrument_number text not null check (length(btrim(instrument_number)) > 0),
  source_account_id uuid not null references public.finance_accounts(id) on update cascade on delete restrict,
  status text not null default 'issued' check (status in ('issued','cleared','voided','returned')),
  issued_at timestamptz not null,
  cleared_at timestamptz null,
  voided_at timestamptz null,
  returned_at timestamptz null,
  status_reason text null,
  reference_no text null,
  notes text null,
  created_by uuid null references public.profiles(id) on delete set null,
  updated_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_payment_instruments_transaction_uq unique(transaction_id),
  constraint finance_payment_instruments_lifecycle_check check (
    (status='issued' and cleared_at is null and voided_at is null and returned_at is null)
    or (status='cleared' and cleared_at is not null and voided_at is null and returned_at is null)
    or (status='voided' and cleared_at is null and voided_at is not null and returned_at is null and nullif(btrim(coalesce(status_reason,'')),'') is not null)
    or (status='returned' and voided_at is null and returned_at is not null and nullif(btrim(coalesce(status_reason,'')),'') is not null)
  ),
  constraint finance_payment_instruments_time_check check (
    (cleared_at is null or cleared_at >= issued_at)
    and (voided_at is null or voided_at >= issued_at)
    and (returned_at is null or returned_at >= issued_at)
    and (cleared_at is null or returned_at is null or returned_at >= cleared_at)
  )
);

-- A check number remains historically unique within the source financial account even after void/return.
create unique index finance_payment_instruments_account_number_uidx
  on public.finance_payment_instruments(source_account_id,instrument_type,lower(btrim(instrument_number)));
create index finance_payment_instruments_status_idx on public.finance_payment_instruments(status,issued_at desc);
create index finance_payment_instruments_method_idx on public.finance_payment_instruments(payment_method_id);

create table public.finance_payment_instrument_audit (
  id uuid primary key default gen_random_uuid(),
  instrument_id uuid not null references public.finance_payment_instruments(id) on update cascade on delete restrict,
  action_type text not null check (length(btrim(action_type)) > 0),
  before_snapshot jsonb null,
  after_snapshot jsonb null,
  reason text null,
  actor_id uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index finance_payment_instrument_audit_instrument_idx
  on public.finance_payment_instrument_audit(instrument_id,created_at desc);

alter table public.finance_payment_instruments enable row level security;
alter table public.finance_payment_instrument_audit enable row level security;

create or replace function private.vendor_payment_derived_key(p_key uuid,p_suffix text)
returns uuid
language sql
immutable
set search_path = ''
as $function$
  select (
    substr(md5($1::text || ':' || coalesce($2,'')),1,8) || '-' ||
    substr(md5($1::text || ':' || coalesce($2,'')),9,4) || '-' ||
    substr(md5($1::text || ':' || coalesce($2,'')),13,4) || '-' ||
    substr(md5($1::text || ':' || coalesce($2,'')),17,4) || '-' ||
    substr(md5($1::text || ':' || coalesce($2,'')),21,12)
  )::uuid;
$function$;

create or replace function private.finance_payment_instrument_audit_write(
  p_instrument_id uuid,p_action text,p_before jsonb,p_after jsonb,p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.finance_payment_instrument_audit(instrument_id,action_type,before_snapshot,after_snapshot,reason,actor_id)
  values(p_instrument_id,btrim(p_action),p_before,p_after,nullif(btrim(coalesce(p_reason,'')),''),auth.uid());
end;
$function$;

-- Vendor payments are source-managed. Generic Finance writes must not bypass Vendor/method/instrument semantics.
create or replace function private.guard_vendor_payment_flow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if coalesce(current_setting('modulex.vendor_payment_flow',true),'') <> 'on' then
    if tg_op='INSERT' and new.transaction_kind='vendor_payment' then
      raise exception 'Vendor payments must be created through the canonical Vendor Payments flow.' using errcode='23514';
    elsif tg_op='UPDATE' and (old.transaction_kind='vendor_payment' or new.transaction_kind='vendor_payment') then
      raise exception 'Vendor payments must be changed through the canonical Vendor Payments flow.' using errcode='23514';
    elsif tg_op='DELETE' and old.transaction_kind='vendor_payment' then
      raise exception 'Vendor payments must be deleted through the canonical Vendor Payments flow.' using errcode='23514';
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$function$;

drop trigger if exists trg_guard_vendor_payment_flow on public.finance_transactions;
create trigger trg_guard_vendor_payment_flow
before insert or update or delete on public.finance_transactions
for each row execute function private.guard_vendor_payment_flow();

create or replace function private.guard_finance_payment_instrument()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_tx public.finance_transactions%rowtype;
  v_method_key text;
begin
  if tg_op='DELETE' then
    raise exception 'Payment instrument history is append-safe and cannot be deleted.' using errcode='23514';
  end if;

  if tg_op='UPDATE' then
    if new.transaction_id is distinct from old.transaction_id
       or new.payment_method_id is distinct from old.payment_method_id
       or new.instrument_type is distinct from old.instrument_type
       or new.instrument_number is distinct from old.instrument_number
       or new.source_account_id is distinct from old.source_account_id
       or new.issued_at is distinct from old.issued_at then
      raise exception 'Issued payment instrument identity is immutable.' using errcode='23514';
    end if;
    if coalesce(current_setting('modulex.payment_instrument_flow',true),'') <> 'on' then
      raise exception 'Payment instrument lifecycle must use canonical Finance actions.' using errcode='23514';
    end if;
    return new;
  end if;

  if coalesce(current_setting('modulex.payment_instrument_flow',true),'') <> 'on' then
    raise exception 'Payment instruments must be created by canonical Vendor Payment posting.' using errcode='23514';
  end if;

  select * into v_tx from public.finance_transactions where id=new.transaction_id;
  if v_tx.id is null or v_tx.transaction_kind<>'vendor_payment' or v_tx.status<>'draft' then
    raise exception 'A payment instrument can only be issued while posting a Vendor Payment draft.' using errcode='23514';
  end if;
  if v_tx.source_account_id is distinct from new.source_account_id then
    raise exception 'Payment instrument source account must match the Vendor Payment source account.' using errcode='23514';
  end if;
  if v_tx.payment_method_id is distinct from new.payment_method_id then
    raise exception 'Payment instrument method must match the Vendor Payment method.' using errcode='23514';
  end if;
  select pm.system_key into v_method_key from public.payment_methods pm where pm.id=new.payment_method_id and pm.is_active;
  if v_method_key is distinct from 'check' or new.instrument_type<>'check' then
    raise exception 'Initial F3C instrument lifecycle is only valid for canonical Check payments.' using errcode='23514';
  end if;
  if new.status<>'issued' then
    raise exception 'A newly recorded Check must start as issued, not cleared.' using errcode='23514';
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_guard_finance_payment_instrument on public.finance_payment_instruments;
create trigger trg_guard_finance_payment_instrument
before insert or update or delete on public.finance_payment_instruments
for each row execute function private.guard_finance_payment_instrument();

create or replace function private.guard_finance_payment_instrument_audit()
returns trigger language plpgsql security definer set search_path='' as $function$
begin
  raise exception 'Payment instrument audit history is append-only.' using errcode='23514';
end;$function$;
create trigger trg_finance_payment_instrument_audit_append_only
before update or delete on public.finance_payment_instrument_audit
for each row execute function private.guard_finance_payment_instrument_audit();

-- Extend posted-history immutability for the new canonical payment method relation.
create or replace function private.guard_finance_transaction_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op='DELETE' then
    if old.status<>'draft' then raise exception 'Posted Finance transactions are immutable; use void or reversal.' using errcode='23514'; end if;
    return old;
  end if;
  if old.status='voided' then raise exception 'Voided Finance transactions are immutable.' using errcode='23514'; end if;
  if old.status='posted' then
    if new.status<>'voided'
       or new.transaction_kind is distinct from old.transaction_kind
       or new.source_account_id is distinct from old.source_account_id
       or new.destination_account_id is distinct from old.destination_account_id
       or new.category_id is distinct from old.category_id
       or new.payment_method_id is distinct from old.payment_method_id
       or new.amount is distinct from old.amount
       or new.currency_code is distinct from old.currency_code
       or new.transaction_at is distinct from old.transaction_at
       or new.reference_no is distinct from old.reference_no
       or new.notes is distinct from old.notes
       or new.base_currency_code is distinct from old.base_currency_code
       or new.base_amount is distinct from old.base_amount
       or new.fx_rate is distinct from old.fx_rate
       or new.fx_rate_source is distinct from old.fx_rate_source
       or new.fx_rate_id is distinct from old.fx_rate_id
       or new.reversal_of_transaction_id is distinct from old.reversal_of_transaction_id
       or new.posted_at is distinct from old.posted_at
       or new.posted_by is distinct from old.posted_by
       or new.voided_at is null or new.voided_by is null
       or nullif(btrim(coalesce(new.void_reason,'')),'') is null then
      raise exception 'Posted Finance transactions are immutable; only a guarded void transition is allowed.' using errcode='23514';
    end if;
  end if;
  return new;
end;
$function$;

-- Extend canonical Finance reversal so payment_method_id and canonical Vendor identity survive reversals.
create or replace function private.reverse_finance_transaction(
  p_transaction_id uuid,p_reason text,p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_original public.finance_transactions%rowtype;
  v_reversal_id uuid;
  v_existing uuid;
  v_fingerprint text;
begin
  perform private.finance_assert_manage();
  if nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception 'Finance reversal reason is required.' using errcode='22023'; end if;
  v_fingerprint:=md5(jsonb_build_object('transaction_id',p_transaction_id,'reason',btrim(p_reason))::text);
  v_existing:=private.finance_idempotency_existing('reverse',p_idempotency_key,v_fingerprint);
  if v_existing is not null then return v_existing; end if;

  select * into v_original from public.finance_transactions where id=p_transaction_id for update;
  if v_original.id is null or v_original.status<>'posted' then raise exception 'Only a posted Finance transaction can be reversed.' using errcode='23514'; end if;
  if v_original.transaction_kind='vendor_payment' and coalesce(current_setting('modulex.vendor_payment_flow',true),'')<>'on' then
    raise exception 'Vendor Payment reversal must reconcile AP through the canonical Vendor Payments flow.' using errcode='23514';
  end if;
  if exists(select 1 from public.finance_transactions r where r.reversal_of_transaction_id=p_transaction_id and r.status='posted') then
    raise exception 'Finance transaction has already been reversed.' using errcode='23514';
  end if;

  insert into public.finance_transactions(transaction_kind,status,source_account_id,destination_account_id,category_id,payment_method_id,amount,currency_code,transaction_at,reference_no,notes,reversal_of_transaction_id,created_by,updated_by)
  values('reversal','draft',v_original.destination_account_id,v_original.source_account_id,v_original.category_id,v_original.payment_method_id,v_original.amount,v_original.currency_code,now(),v_original.reference_no,btrim(p_reason),v_original.id,auth.uid(),auth.uid())
  returning id into v_reversal_id;

  insert into public.finance_transaction_links(transaction_id,project_id,order_id,customer_id,employee_id,vendor_id,vendor_code,source_document_type,source_document_id,allocated_amount,notes,created_by)
  select v_reversal_id,l.project_id,l.order_id,l.customer_id,l.employee_id,l.vendor_id,l.vendor_code,l.source_document_type,l.source_document_id,l.allocated_amount,l.notes,auth.uid()
  from public.finance_transaction_links l where l.transaction_id=p_transaction_id;

  update public.finance_transactions
  set status='posted',base_currency_code=v_original.base_currency_code,base_amount=v_original.base_amount,fx_rate=v_original.fx_rate,
      fx_rate_source=coalesce(v_original.fx_rate_source,'reversal_snapshot'),fx_rate_id=v_original.fx_rate_id,
      posted_at=now(),posted_by=auth.uid(),updated_at=now(),updated_by=auth.uid()
  where id=v_reversal_id;

  insert into public.finance_transaction_audit(transaction_id,action_type,after_snapshot,reason,actor_id)
  select v_reversal_id,'reverse',to_jsonb(t),btrim(p_reason),auth.uid() from public.finance_transactions t where t.id=v_reversal_id;
  perform private.finance_store_idempotency('reverse',p_idempotency_key,v_fingerprint,v_reversal_id);
  return v_reversal_id;
end;
$function$;

create or replace function private.vendor_payment_reverse_bill_allocations(
  p_payment_transaction_id uuid,p_reversal_transaction_id uuid,p_reason text,p_idempotency_key uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare v_alloc public.vendor_invoice_payment_allocations%rowtype; v_count integer:=0;
begin
  for v_alloc in
    select a.* from public.vendor_invoice_payment_allocations a
    where a.finance_transaction_id=p_payment_transaction_id and a.amount_delta>0
      and not exists(select 1 from public.vendor_invoice_payment_allocations r where r.reversal_of_allocation_id=a.id)
    order by a.created_at,a.id
  loop
    perform private.reverse_vendor_invoice_payment_allocation(
      v_alloc.id,p_reversal_transaction_id,p_reason,
      private.vendor_payment_derived_key(p_idempotency_key,'bill-allocation:'||v_alloc.id::text)
    );
    v_count:=v_count+1;
  end loop;
  return v_count;
end;
$function$;

create or replace function private.get_vendor_payment_reference_data()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  perform private.finance_assert_view();
  return jsonb_build_object(
    'vendors',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'code',v.code,'name',v.display_name,'status',v.status,'currency_code',v.default_currency_code) order by v.display_name,v.id) from public.vendors v where v.status<>'inactive'),'[]'::jsonb),
    'payment_methods',coalesce((select jsonb_agg(jsonb_build_object('id',pm.id,'system_key',pm.system_key,'name',pm.name) order by pm.sort_order,pm.name,pm.id) from public.payment_methods pm where pm.is_active),'[]'::jsonb),
    'accounts',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'name',a.name,'code',a.code,'currency_code',a.currency_code,'account_type',a.account_type) order by a.name,a.id) from public.finance_accounts a where a.is_active),'[]'::jsonb)
  );
end;
$function$;

create or replace function private.get_vendor_payments_page(
  p_limit integer default 50,p_offset integer default 0,p_vendor_id uuid default null,p_status text default null,
  p_payment_method_id uuid default null,p_instrument_status text default null,p_search text default null
)
returns table(
  id uuid,vendor_id uuid,vendor_code text,vendor_name text,source_account_id uuid,source_account_name text,
  payment_method_id uuid,payment_method_key text,payment_method_name text,amount numeric,currency_code varchar,
  transaction_at timestamptz,reference_no text,notes text,status text,posted_at timestamptz,
  instrument_id uuid,instrument_type text,instrument_number text,instrument_status text,issued_at timestamptz,cleared_at timestamptz,voided_at timestamptz,returned_at timestamptz,
  allocated_amount numeric,unapplied_amount numeric,reversal_transaction_id uuid,total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  perform private.finance_assert_view();
  return query
  select t.id,l.vendor_id,l.vendor_code,v.display_name,a.id,a.name,pm.id,pm.system_key,pm.name,t.amount,t.currency_code,t.transaction_at,t.reference_no,t.notes,t.status,t.posted_at,
    pi.id,pi.instrument_type,pi.instrument_number,pi.status,pi.issued_at,pi.cleared_at,pi.voided_at,pi.returned_at,
    coalesce(pa.allocated_amount,0)::numeric,greatest(t.amount-coalesce(pa.allocated_amount,0),0)::numeric,
    (select r.id from public.finance_transactions r where r.reversal_of_transaction_id=t.id and r.status='posted' order by r.posted_at desc nulls last,r.id limit 1),
    count(*) over()
  from public.finance_transactions t
  left join lateral (
    select x.vendor_id,x.vendor_code from public.finance_transaction_links x
    where x.transaction_id=t.id and (x.vendor_id is not null or x.vendor_code is not null)
    order by x.created_at,x.id limit 1
  ) l on true
  left join public.vendors v on v.id=l.vendor_id
  left join public.finance_accounts a on a.id=t.source_account_id
  left join public.payment_methods pm on pm.id=t.payment_method_id
  left join public.finance_payment_instruments pi on pi.transaction_id=t.id
  left join lateral (
    select coalesce(sum(x.amount_delta),0) as allocated_amount from public.vendor_invoice_payment_allocations x where x.finance_transaction_id=t.id
  ) pa on true
  where t.transaction_kind='vendor_payment'
    and (p_vendor_id is null or l.vendor_id=p_vendor_id)
    and (p_status is null or t.status=p_status)
    and (p_payment_method_id is null or t.payment_method_id=p_payment_method_id)
    and (p_instrument_status is null or pi.status=p_instrument_status)
    and (nullif(btrim(coalesce(p_search,'')),'') is null
      or coalesce(v.display_name,l.vendor_code,'') ilike '%'||btrim(p_search)||'%'
      or coalesce(t.reference_no,'') ilike '%'||btrim(p_search)||'%'
      or coalesce(pi.instrument_number,'') ilike '%'||btrim(p_search)||'%')
  order by t.transaction_at desc,t.id
  limit least(greatest(coalesce(p_limit,50),1),200) offset greatest(coalesce(p_offset,0),0);
end;
$function$;

create or replace function private.get_vendor_payment_detail(p_transaction_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare v_tx public.finance_transactions%rowtype; v_vendor_id uuid; v_allocated numeric;
begin
  perform private.finance_assert_view();
  select * into v_tx from public.finance_transactions where id=p_transaction_id and transaction_kind='vendor_payment';
  if v_tx.id is null then raise exception 'Vendor Payment not found.' using errcode='23503'; end if;
  select l.vendor_id into v_vendor_id from public.finance_transaction_links l where l.transaction_id=v_tx.id and l.vendor_id is not null order by l.created_at,l.id limit 1;
  select coalesce(sum(a.amount_delta),0) into v_allocated from public.vendor_invoice_payment_allocations a where a.finance_transaction_id=v_tx.id;
  return jsonb_build_object(
    'transaction',to_jsonb(v_tx)||jsonb_build_object('allocated_amount',v_allocated,'unapplied_amount',greatest(v_tx.amount-v_allocated,0)),
    'vendor',(select to_jsonb(v) from public.vendors v where v.id=v_vendor_id),
    'payment_method',(select to_jsonb(pm) from public.payment_methods pm where pm.id=v_tx.payment_method_id),
    'instrument',(select to_jsonb(pi) from public.finance_payment_instruments pi where pi.transaction_id=v_tx.id),
    'bill_allocations',coalesce((select jsonb_agg(to_jsonb(a)||jsonb_build_object('invoice_number',i.invoice_number,'invoice_date',i.invoice_date,'due_date',i.due_date,'vendor_name_snapshot',i.vendor_name_snapshot) order by a.created_at,a.id) from public.vendor_invoice_payment_allocations a join public.vendor_invoices i on i.id=a.invoice_id where a.finance_transaction_id=v_tx.id),'[]'::jsonb),
    'instrument_audit',coalesce((select jsonb_agg(to_jsonb(ia) order by ia.created_at,ia.id) from public.finance_payment_instrument_audit ia join public.finance_payment_instruments pi on pi.id=ia.instrument_id where pi.transaction_id=v_tx.id),'[]'::jsonb),
    'reversal',(select to_jsonb(r) from public.finance_transactions r where r.reversal_of_transaction_id=v_tx.id and r.status='posted' order by r.posted_at desc nulls last,r.id limit 1)
  );
end;
$function$;

create or replace function private.create_vendor_payment_draft(
  p_vendor_id uuid,p_source_account_id uuid,p_payment_method_id uuid,p_amount numeric,p_currency_code text,
  p_transaction_at timestamptz,p_reference_no text default null,p_notes text default null,p_idempotency_key uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare v_vendor public.vendors%rowtype; v_account public.finance_accounts%rowtype; v_method public.payment_methods%rowtype; v_id uuid; v_existing uuid; v_fingerprint text;
begin
  perform private.finance_assert_manage();
  if p_idempotency_key is null then raise exception 'Idempotency key is required.' using errcode='22023'; end if;
  select * into v_vendor from public.vendors where id=p_vendor_id;
  if v_vendor.id is null or v_vendor.status='inactive' then raise exception 'Canonical active Vendor is required.' using errcode='23514'; end if;
  select * into v_account from public.finance_accounts where id=p_source_account_id;
  if v_account.id is null or not v_account.is_active then raise exception 'Active Finance source account is required.' using errcode='23514'; end if;
  select * into v_method from public.payment_methods where id=p_payment_method_id;
  if v_method.id is null or not v_method.is_active then raise exception 'Active canonical Payment Method is required.' using errcode='23514'; end if;
  if p_amount is null or p_amount<=0 then raise exception 'Vendor Payment amount must be greater than zero.' using errcode='22023'; end if;
  if upper(btrim(coalesce(p_currency_code,'')))<>v_account.currency_code then raise exception 'Vendor Payment currency must match the source Finance account currency.' using errcode='23514'; end if;

  v_fingerprint:=md5(jsonb_build_object('vendor',p_vendor_id,'account',p_source_account_id,'method',p_payment_method_id,'amount',p_amount,'currency',upper(btrim(p_currency_code)),'at',p_transaction_at,'reference',nullif(btrim(coalesce(p_reference_no,'')),''),'notes',nullif(btrim(coalesce(p_notes,'')),''))::text);
  v_existing:=private.finance_idempotency_existing('vendor_payment_create',p_idempotency_key,v_fingerprint);
  if v_existing is not null then return v_existing; end if;

  perform set_config('modulex.vendor_payment_flow','on',true);
  v_id:=private.create_finance_transaction_draft('vendor_payment',p_source_account_id,null,null,p_amount,upper(btrim(p_currency_code)),coalesce(p_transaction_at,now()),p_reference_no,p_notes,private.vendor_payment_derived_key(p_idempotency_key,'finance-create'));
  update public.finance_transactions set payment_method_id=p_payment_method_id,updated_by=auth.uid(),updated_at=now() where id=v_id;
  insert into public.finance_transaction_links(transaction_id,vendor_id,vendor_code,allocated_amount,notes,created_by)
  values(v_id,v_vendor.id,v_vendor.code,p_amount,'Canonical Vendor Payment attribution',auth.uid());
  perform set_config('modulex.vendor_payment_flow','',true);
  perform private.finance_store_idempotency('vendor_payment_create',p_idempotency_key,v_fingerprint,v_id);
  return v_id;
end;
$function$;

create or replace function private.post_vendor_payment(
  p_transaction_id uuid,p_bill_allocations jsonb default '[]'::jsonb,
  p_check_number text default null,p_issued_at timestamptz default null,p_instrument_reference text default null,p_instrument_notes text default null,
  p_manual_fx_rate numeric default null,p_manual_fx_rate_source text default null,p_idempotency_key uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_tx public.finance_transactions%rowtype; v_method public.payment_methods%rowtype; v_vendor_id uuid;
  v_item jsonb; v_total numeric:=0; v_existing uuid; v_fingerprint text; v_instrument_id uuid;
begin
  perform private.finance_assert_manage();
  if p_idempotency_key is null then raise exception 'Idempotency key is required.' using errcode='22023'; end if;
  if p_bill_allocations is null or jsonb_typeof(p_bill_allocations)<>'array' then raise exception 'Bill allocations must be a JSON array.' using errcode='22023'; end if;
  select * into v_tx from public.finance_transactions where id=p_transaction_id for update;
  if v_tx.id is null or v_tx.transaction_kind<>'vendor_payment' or v_tx.status<>'draft' then raise exception 'Only a Vendor Payment draft can be posted.' using errcode='23514'; end if;
  select * into v_method from public.payment_methods where id=v_tx.payment_method_id;
  if v_method.id is null or not v_method.is_active then raise exception 'Vendor Payment requires an active canonical Payment Method.' using errcode='23514'; end if;
  select l.vendor_id into v_vendor_id from public.finance_transaction_links l where l.transaction_id=v_tx.id and l.vendor_id is not null order by l.created_at,l.id limit 1;
  if v_vendor_id is null then raise exception 'Vendor Payment requires canonical Vendor attribution.' using errcode='23514'; end if;

  for v_item in select value from jsonb_array_elements(p_bill_allocations) loop
    if nullif(v_item->>'invoice_id','') is null or nullif(v_item->>'amount','')::numeric is null or (v_item->>'amount')::numeric<=0 then raise exception 'Each bill allocation requires invoice_id and positive amount.' using errcode='22023'; end if;
    if not exists(select 1 from public.vendor_invoices i where i.id=(v_item->>'invoice_id')::uuid and i.vendor_id=v_vendor_id and i.status='open') then raise exception 'Bill allocation must reference an open bill for the same canonical Vendor.' using errcode='23514'; end if;
    v_total:=v_total+(v_item->>'amount')::numeric;
  end loop;
  if v_total>v_tx.amount+0.0001 then raise exception 'Vendor Payment bill allocations cannot exceed the payment amount.' using errcode='23514'; end if;

  if v_method.system_key='check' then
    if nullif(btrim(coalesce(p_check_number,'')),'') is null or p_issued_at is null then raise exception 'Check number and issued time are required for Check payments.' using errcode='22023'; end if;
  elsif nullif(btrim(coalesce(p_check_number,'')),'') is not null or p_issued_at is not null then
    raise exception 'Check fields are only valid for the canonical Check payment method.' using errcode='22023';
  end if;

  v_fingerprint:=md5(jsonb_build_object('transaction',p_transaction_id,'allocations',p_bill_allocations,'check',nullif(btrim(coalesce(p_check_number,'')),''),'issued_at',p_issued_at,'manual_rate',p_manual_fx_rate,'manual_source',nullif(btrim(coalesce(p_manual_fx_rate_source,'')),''))::text);
  v_existing:=private.finance_idempotency_existing('vendor_payment_post',p_idempotency_key,v_fingerprint);
  if v_existing is not null then return v_existing; end if;

  perform set_config('modulex.vendor_payment_flow','on',true);
  if v_method.system_key='check' then
    perform set_config('modulex.payment_instrument_flow','on',true);
    insert into public.finance_payment_instruments(transaction_id,payment_method_id,instrument_type,instrument_number,source_account_id,status,issued_at,reference_no,notes,created_by,updated_by)
    values(v_tx.id,v_method.id,'check',btrim(p_check_number),v_tx.source_account_id,'issued',p_issued_at,nullif(btrim(coalesce(p_instrument_reference,'')),''),nullif(btrim(coalesce(p_instrument_notes,'')),''),auth.uid(),auth.uid())
    returning id into v_instrument_id;
    perform private.finance_payment_instrument_audit_write(v_instrument_id,'issued',null,(select to_jsonb(pi) from public.finance_payment_instruments pi where pi.id=v_instrument_id));
    perform set_config('modulex.payment_instrument_flow','',true);
  end if;

  perform private.post_finance_transaction(v_tx.id,p_manual_fx_rate,p_manual_fx_rate_source,private.vendor_payment_derived_key(p_idempotency_key,'finance-post'));
  for v_item in select value from jsonb_array_elements(p_bill_allocations) loop
    perform private.allocate_vendor_payment_to_invoice((v_item->>'invoice_id')::uuid,v_tx.id,(v_item->>'amount')::numeric,private.vendor_payment_derived_key(p_idempotency_key,'bill:'||(v_item->>'invoice_id')));
  end loop;
  perform set_config('modulex.vendor_payment_flow','',true);
  perform private.finance_store_idempotency('vendor_payment_post',p_idempotency_key,v_fingerprint,v_tx.id);
  return v_tx.id;
end;
$function$;

create or replace function private.delete_vendor_payment_draft(p_transaction_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare v_tx public.finance_transactions%rowtype;
begin
  perform private.finance_assert_manage();
  select * into v_tx from public.finance_transactions where id=p_transaction_id for update;
  if v_tx.id is null or v_tx.transaction_kind<>'vendor_payment' or v_tx.status<>'draft' then raise exception 'Deletable Vendor Payment draft not found.' using errcode='23514'; end if;
  if exists(select 1 from public.finance_payment_instruments pi where pi.transaction_id=v_tx.id) then raise exception 'Issued payment instruments cannot be deleted.' using errcode='23514'; end if;
  perform set_config('modulex.vendor_payment_flow','on',true);
  perform private.delete_finance_transaction_draft(v_tx.id);
  perform set_config('modulex.vendor_payment_flow','',true);
  return v_tx.id;
end;
$function$;

create or replace function private.clear_vendor_payment_instrument(p_transaction_id uuid,p_cleared_at timestamptz,p_reference_no text default null,p_notes text default null,p_idempotency_key uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare v_pi public.finance_payment_instruments%rowtype; v_tx public.finance_transactions%rowtype; v_before jsonb; v_existing uuid; v_fingerprint text;
begin
  perform private.finance_assert_manage();
  if p_idempotency_key is null then raise exception 'Idempotency key is required.' using errcode='22023'; end if;
  select * into v_tx from public.finance_transactions where id=p_transaction_id;
  select * into v_pi from public.finance_payment_instruments where transaction_id=p_transaction_id for update;
  if v_tx.id is null or v_tx.status<>'posted' or v_tx.transaction_kind<>'vendor_payment' or v_pi.id is null or v_pi.status<>'issued' then raise exception 'Only an issued Check on a posted Vendor Payment can be cleared.' using errcode='23514'; end if;
  if p_cleared_at is null or p_cleared_at<v_pi.issued_at then raise exception 'Cleared time must be on/after Check issue time.' using errcode='22023'; end if;
  v_fingerprint:=md5(jsonb_build_object('transaction',p_transaction_id,'cleared_at',p_cleared_at,'reference',nullif(btrim(coalesce(p_reference_no,'')),''),'notes',nullif(btrim(coalesce(p_notes,'')),''))::text);
  v_existing:=private.finance_idempotency_existing('vendor_payment_check_clear',p_idempotency_key,v_fingerprint);
  if v_existing is not null then return v_existing; end if;
  v_before:=to_jsonb(v_pi);
  perform set_config('modulex.payment_instrument_flow','on',true);
  update public.finance_payment_instruments set status='cleared',cleared_at=p_cleared_at,reference_no=coalesce(nullif(btrim(coalesce(p_reference_no,'')),''),reference_no),notes=coalesce(nullif(btrim(coalesce(p_notes,'')),''),notes),updated_by=auth.uid(),updated_at=now() where id=v_pi.id;
  perform set_config('modulex.payment_instrument_flow','',true);
  perform private.finance_payment_instrument_audit_write(v_pi.id,'cleared',v_before,(select to_jsonb(pi) from public.finance_payment_instruments pi where pi.id=v_pi.id));
  perform private.finance_store_idempotency('vendor_payment_check_clear',p_idempotency_key,v_fingerprint,v_tx.id);
  return v_tx.id;
end;
$function$;

create or replace function private.reverse_vendor_payment(p_transaction_id uuid,p_reason text,p_idempotency_key uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare v_tx public.finance_transactions%rowtype; v_existing uuid; v_fingerprint text; v_reversal uuid;
begin
  perform private.finance_assert_manage();
  if p_idempotency_key is null or nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception 'Vendor Payment reversal reason and idempotency key are required.' using errcode='22023'; end if;
  select * into v_tx from public.finance_transactions where id=p_transaction_id for update;
  if v_tx.id is null or v_tx.transaction_kind<>'vendor_payment' or v_tx.status<>'posted' then raise exception 'Only a posted Vendor Payment can be reversed.' using errcode='23514'; end if;
  if exists(select 1 from public.finance_payment_instruments pi where pi.transaction_id=v_tx.id) then raise exception 'Check payments must use Void or Return so instrument lifecycle stays reconciled.' using errcode='23514'; end if;
  v_fingerprint:=md5(jsonb_build_object('transaction',p_transaction_id,'reason',btrim(p_reason))::text);
  v_existing:=private.finance_idempotency_existing('vendor_payment_reverse',p_idempotency_key,v_fingerprint);
  if v_existing is not null then return v_existing; end if;
  perform set_config('modulex.vendor_payment_flow','on',true);
  v_reversal:=private.reverse_finance_transaction(v_tx.id,p_reason,private.vendor_payment_derived_key(p_idempotency_key,'finance-reversal'));
  perform private.vendor_payment_reverse_bill_allocations(v_tx.id,v_reversal,p_reason,p_idempotency_key);
  perform set_config('modulex.vendor_payment_flow','',true);
  perform private.finance_store_idempotency('vendor_payment_reverse',p_idempotency_key,v_fingerprint,v_reversal);
  return v_reversal;
end;
$function$;

create or replace function private.void_vendor_payment_instrument(p_transaction_id uuid,p_voided_at timestamptz,p_reason text,p_idempotency_key uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare v_pi public.finance_payment_instruments%rowtype; v_tx public.finance_transactions%rowtype; v_before jsonb; v_existing uuid; v_fingerprint text; v_reversal uuid;
begin
  perform private.finance_assert_manage();
  if p_idempotency_key is null or nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception 'Check void reason and idempotency key are required.' using errcode='22023'; end if;
  select * into v_tx from public.finance_transactions where id=p_transaction_id for update;
  select * into v_pi from public.finance_payment_instruments where transaction_id=p_transaction_id for update;
  if v_tx.id is null or v_tx.status<>'posted' or v_tx.transaction_kind<>'vendor_payment' or v_pi.id is null or v_pi.status<>'issued' then raise exception 'Only an issued Check on a posted Vendor Payment can be voided.' using errcode='23514'; end if;
  if p_voided_at is null or p_voided_at<v_pi.issued_at then raise exception 'Voided time must be on/after Check issue time.' using errcode='22023'; end if;
  v_fingerprint:=md5(jsonb_build_object('transaction',p_transaction_id,'voided_at',p_voided_at,'reason',btrim(p_reason))::text);
  v_existing:=private.finance_idempotency_existing('vendor_payment_check_void',p_idempotency_key,v_fingerprint);
  if v_existing is not null then return v_existing; end if;
  v_before:=to_jsonb(v_pi);
  perform set_config('modulex.vendor_payment_flow','on',true);
  v_reversal:=private.reverse_finance_transaction(v_tx.id,p_reason,private.vendor_payment_derived_key(p_idempotency_key,'finance-reversal'));
  perform private.vendor_payment_reverse_bill_allocations(v_tx.id,v_reversal,p_reason,p_idempotency_key);
  perform set_config('modulex.payment_instrument_flow','on',true);
  update public.finance_payment_instruments set status='voided',voided_at=p_voided_at,status_reason=btrim(p_reason),updated_by=auth.uid(),updated_at=now() where id=v_pi.id;
  perform set_config('modulex.payment_instrument_flow','',true);
  perform set_config('modulex.vendor_payment_flow','',true);
  perform private.finance_payment_instrument_audit_write(v_pi.id,'voided',v_before,(select to_jsonb(pi) from public.finance_payment_instruments pi where pi.id=v_pi.id),p_reason);
  perform private.finance_store_idempotency('vendor_payment_check_void',p_idempotency_key,v_fingerprint,v_reversal);
  return v_reversal;
end;
$function$;

create or replace function private.return_vendor_payment_instrument(p_transaction_id uuid,p_returned_at timestamptz,p_reason text,p_idempotency_key uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare v_pi public.finance_payment_instruments%rowtype; v_tx public.finance_transactions%rowtype; v_before jsonb; v_existing uuid; v_fingerprint text; v_reversal uuid;
begin
  perform private.finance_assert_manage();
  if p_idempotency_key is null or nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception 'Returned Check reason and idempotency key are required.' using errcode='22023'; end if;
  select * into v_tx from public.finance_transactions where id=p_transaction_id for update;
  select * into v_pi from public.finance_payment_instruments where transaction_id=p_transaction_id for update;
  if v_tx.id is null or v_tx.status<>'posted' or v_tx.transaction_kind<>'vendor_payment' or v_pi.id is null or v_pi.status not in ('issued','cleared') then raise exception 'Only an issued or cleared Check on a posted Vendor Payment can be returned.' using errcode='23514'; end if;
  if p_returned_at is null or p_returned_at<v_pi.issued_at or (v_pi.cleared_at is not null and p_returned_at<v_pi.cleared_at) then raise exception 'Returned time must follow the Check lifecycle timestamps.' using errcode='22023'; end if;
  v_fingerprint:=md5(jsonb_build_object('transaction',p_transaction_id,'returned_at',p_returned_at,'reason',btrim(p_reason))::text);
  v_existing:=private.finance_idempotency_existing('vendor_payment_check_return',p_idempotency_key,v_fingerprint);
  if v_existing is not null then return v_existing; end if;
  v_before:=to_jsonb(v_pi);
  perform set_config('modulex.vendor_payment_flow','on',true);
  v_reversal:=private.reverse_finance_transaction(v_tx.id,p_reason,private.vendor_payment_derived_key(p_idempotency_key,'finance-reversal'));
  perform private.vendor_payment_reverse_bill_allocations(v_tx.id,v_reversal,p_reason,p_idempotency_key);
  perform set_config('modulex.payment_instrument_flow','on',true);
  update public.finance_payment_instruments set status='returned',returned_at=p_returned_at,status_reason=btrim(p_reason),updated_by=auth.uid(),updated_at=now() where id=v_pi.id;
  perform set_config('modulex.payment_instrument_flow','',true);
  perform set_config('modulex.vendor_payment_flow','',true);
  perform private.finance_payment_instrument_audit_write(v_pi.id,'returned',v_before,(select to_jsonb(pi) from public.finance_payment_instruments pi where pi.id=v_pi.id),p_reason);
  perform private.finance_store_idempotency('vendor_payment_check_return',p_idempotency_key,v_fingerprint,v_reversal);
  return v_reversal;
end;
$function$;

-- Public protected wrappers.
create or replace function public.get_vendor_payment_reference_data() returns jsonb language sql stable security definer set search_path='' as $function$ select private.get_vendor_payment_reference_data();$function$;
create or replace function public.get_vendor_payments_page(p_limit integer default 50,p_offset integer default 0,p_vendor_id uuid default null,p_status text default null,p_payment_method_id uuid default null,p_instrument_status text default null,p_search text default null)
returns table(id uuid,vendor_id uuid,vendor_code text,vendor_name text,source_account_id uuid,source_account_name text,payment_method_id uuid,payment_method_key text,payment_method_name text,amount numeric,currency_code varchar,transaction_at timestamptz,reference_no text,notes text,status text,posted_at timestamptz,instrument_id uuid,instrument_type text,instrument_number text,instrument_status text,issued_at timestamptz,cleared_at timestamptz,voided_at timestamptz,returned_at timestamptz,allocated_amount numeric,unapplied_amount numeric,reversal_transaction_id uuid,total_count bigint)
language sql stable security definer set search_path='' as $function$ select * from private.get_vendor_payments_page($1,$2,$3,$4,$5,$6,$7);$function$;
create or replace function public.get_vendor_payment_detail(p_transaction_id uuid) returns jsonb language sql stable security definer set search_path='' as $function$ select private.get_vendor_payment_detail($1);$function$;
create or replace function public.create_vendor_payment_draft(p_vendor_id uuid,p_source_account_id uuid,p_payment_method_id uuid,p_amount numeric,p_currency_code text,p_transaction_at timestamptz,p_reference_no text default null,p_notes text default null,p_idempotency_key uuid default null) returns uuid language sql security definer set search_path='' as $function$ select private.create_vendor_payment_draft($1,$2,$3,$4,$5,$6,$7,$8,$9);$function$;
create or replace function public.post_vendor_payment(p_transaction_id uuid,p_bill_allocations jsonb default '[]'::jsonb,p_check_number text default null,p_issued_at timestamptz default null,p_instrument_reference text default null,p_instrument_notes text default null,p_manual_fx_rate numeric default null,p_manual_fx_rate_source text default null,p_idempotency_key uuid default null) returns uuid language sql security definer set search_path='' as $function$ select private.post_vendor_payment($1,$2,$3,$4,$5,$6,$7,$8,$9);$function$;
create or replace function public.delete_vendor_payment_draft(p_transaction_id uuid) returns uuid language sql security definer set search_path='' as $function$ select private.delete_vendor_payment_draft($1);$function$;
create or replace function public.clear_vendor_payment_instrument(p_transaction_id uuid,p_cleared_at timestamptz,p_reference_no text default null,p_notes text default null,p_idempotency_key uuid default null) returns uuid language sql security definer set search_path='' as $function$ select private.clear_vendor_payment_instrument($1,$2,$3,$4,$5);$function$;
create or replace function public.reverse_vendor_payment(p_transaction_id uuid,p_reason text,p_idempotency_key uuid) returns uuid language sql security definer set search_path='' as $function$ select private.reverse_vendor_payment($1,$2,$3);$function$;
create or replace function public.void_vendor_payment_instrument(p_transaction_id uuid,p_voided_at timestamptz,p_reason text,p_idempotency_key uuid) returns uuid language sql security definer set search_path='' as $function$ select private.void_vendor_payment_instrument($1,$2,$3,$4);$function$;
create or replace function public.return_vendor_payment_instrument(p_transaction_id uuid,p_returned_at timestamptz,p_reason text,p_idempotency_key uuid) returns uuid language sql security definer set search_path='' as $function$ select private.return_vendor_payment_instrument($1,$2,$3,$4);$function$;

-- Direct table mutation stays closed to browser roles.
revoke all on public.finance_payment_instruments from public,anon,authenticated;
revoke all on public.finance_payment_instrument_audit from public,anon,authenticated;
create policy finance_payment_instruments_anon_deny on public.finance_payment_instruments as restrictive for all to anon using(false) with check(false);
create policy finance_payment_instruments_authenticated_deny on public.finance_payment_instruments as restrictive for all to authenticated using(false) with check(false);
create policy finance_payment_instrument_audit_anon_deny on public.finance_payment_instrument_audit as restrictive for all to anon using(false) with check(false);
create policy finance_payment_instrument_audit_authenticated_deny on public.finance_payment_instrument_audit as restrictive for all to authenticated using(false) with check(false);

revoke all on function private.vendor_payment_derived_key(uuid,text) from public,anon,authenticated,service_role;
revoke all on function private.finance_payment_instrument_audit_write(uuid,text,jsonb,jsonb,text) from public,anon,authenticated,service_role;
revoke all on function private.guard_vendor_payment_flow() from public,anon,authenticated,service_role;
revoke all on function private.guard_finance_payment_instrument() from public,anon,authenticated,service_role;
revoke all on function private.guard_finance_payment_instrument_audit() from public,anon,authenticated,service_role;
revoke all on function private.vendor_payment_reverse_bill_allocations(uuid,uuid,text,uuid) from public,anon,authenticated,service_role;
revoke all on function private.get_vendor_payment_reference_data() from public,anon,authenticated,service_role;
revoke all on function private.get_vendor_payments_page(integer,integer,uuid,text,uuid,text,text) from public,anon,authenticated,service_role;
revoke all on function private.get_vendor_payment_detail(uuid) from public,anon,authenticated,service_role;
revoke all on function private.create_vendor_payment_draft(uuid,uuid,uuid,numeric,text,timestamptz,text,text,uuid) from public,anon,authenticated,service_role;
revoke all on function private.post_vendor_payment(uuid,jsonb,text,timestamptz,text,text,numeric,text,uuid) from public,anon,authenticated,service_role;
revoke all on function private.delete_vendor_payment_draft(uuid) from public,anon,authenticated,service_role;
revoke all on function private.clear_vendor_payment_instrument(uuid,timestamptz,text,text,uuid) from public,anon,authenticated,service_role;
revoke all on function private.reverse_vendor_payment(uuid,text,uuid) from public,anon,authenticated,service_role;
revoke all on function private.void_vendor_payment_instrument(uuid,timestamptz,text,uuid) from public,anon,authenticated,service_role;
revoke all on function private.return_vendor_payment_instrument(uuid,timestamptz,text,uuid) from public,anon,authenticated,service_role;

revoke execute on function public.get_vendor_payment_reference_data() from public,anon;
revoke execute on function public.get_vendor_payments_page(integer,integer,uuid,text,uuid,text,text) from public,anon;
revoke execute on function public.get_vendor_payment_detail(uuid) from public,anon;
revoke execute on function public.create_vendor_payment_draft(uuid,uuid,uuid,numeric,text,timestamptz,text,text,uuid) from public,anon;
revoke execute on function public.post_vendor_payment(uuid,jsonb,text,timestamptz,text,text,numeric,text,uuid) from public,anon;
revoke execute on function public.delete_vendor_payment_draft(uuid) from public,anon;
revoke execute on function public.clear_vendor_payment_instrument(uuid,timestamptz,text,text,uuid) from public,anon;
revoke execute on function public.reverse_vendor_payment(uuid,text,uuid) from public,anon;
revoke execute on function public.void_vendor_payment_instrument(uuid,timestamptz,text,uuid) from public,anon;
revoke execute on function public.return_vendor_payment_instrument(uuid,timestamptz,text,uuid) from public,anon;

grant execute on function public.get_vendor_payment_reference_data() to authenticated,service_role;
grant execute on function public.get_vendor_payments_page(integer,integer,uuid,text,uuid,text,text) to authenticated,service_role;
grant execute on function public.get_vendor_payment_detail(uuid) to authenticated,service_role;
grant execute on function public.create_vendor_payment_draft(uuid,uuid,uuid,numeric,text,timestamptz,text,text,uuid) to authenticated,service_role;
grant execute on function public.post_vendor_payment(uuid,jsonb,text,timestamptz,text,text,numeric,text,uuid) to authenticated,service_role;
grant execute on function public.delete_vendor_payment_draft(uuid) to authenticated,service_role;
grant execute on function public.clear_vendor_payment_instrument(uuid,timestamptz,text,text,uuid) to authenticated,service_role;
grant execute on function public.reverse_vendor_payment(uuid,text,uuid) to authenticated,service_role;
grant execute on function public.void_vendor_payment_instrument(uuid,timestamptz,text,uuid) to authenticated,service_role;
grant execute on function public.return_vendor_payment_instrument(uuid,timestamptz,text,uuid) to authenticated,service_role;
