-- A6-F1: neutral Finance Core + Cash/Bank foundation.
-- Finance owns money movement. Project/Order/Customer/Vendor/Employee are optional attribution links.

create schema if not exists private;

create table public.finance_accounts (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  account_type text not null check (account_type in ('bank', 'cash', 'clearing')),
  currency_code varchar(3) not null check (currency_code = upper(currency_code) and length(currency_code) = 3),
  institution_name text null,
  reference_no text null,
  is_active boolean not null default true,
  created_by uuid null references public.profiles(id) on delete set null,
  updated_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_accounts_code_not_empty check (length(btrim(code)) > 0),
  constraint finance_accounts_name_not_empty check (length(btrim(name)) > 0)
);

create unique index finance_accounts_code_uidx on public.finance_accounts(lower(code));
create index finance_accounts_active_idx on public.finance_accounts(is_active, account_type, name);

create table public.finance_categories (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  category_type text not null check (category_type in ('expense', 'income')),
  is_active boolean not null default true,
  created_by uuid null references public.profiles(id) on delete set null,
  updated_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_categories_code_not_empty check (length(btrim(code)) > 0),
  constraint finance_categories_name_not_empty check (length(btrim(name)) > 0)
);

create unique index finance_categories_code_uidx on public.finance_categories(lower(code));
create index finance_categories_active_idx on public.finance_categories(is_active, category_type, name);

create table public.finance_fx_rates (
  id uuid primary key default gen_random_uuid(),
  from_currency varchar(3) not null check (from_currency = upper(from_currency) and length(from_currency) = 3),
  to_currency varchar(3) not null check (to_currency = upper(to_currency) and length(to_currency) = 3),
  rate numeric(24,10) not null check (rate > 0),
  rate_source text not null,
  observed_at timestamptz not null,
  is_active boolean not null default true,
  created_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint finance_fx_rates_pair_check check (from_currency <> to_currency),
  constraint finance_fx_rates_source_not_empty check (length(btrim(rate_source)) > 0),
  constraint finance_fx_rates_unique_observation unique (from_currency, to_currency, rate_source, observed_at)
);

create index finance_fx_rates_lookup_idx
  on public.finance_fx_rates(from_currency, to_currency, observed_at desc)
  where is_active;

create table public.finance_transactions (
  id uuid primary key default gen_random_uuid(),
  transaction_kind text not null check (transaction_kind in (
    'expense', 'customer_receipt', 'vendor_payment', 'employee_payment',
    'deposit', 'withdrawal', 'transfer', 'refund', 'reversal'
  )),
  status text not null default 'draft' check (status in ('draft', 'posted', 'voided')),
  source_account_id uuid null references public.finance_accounts(id) on update cascade on delete restrict,
  destination_account_id uuid null references public.finance_accounts(id) on update cascade on delete restrict,
  category_id uuid null references public.finance_categories(id) on update cascade on delete restrict,
  amount numeric(18,4) not null check (amount > 0),
  currency_code varchar(3) not null check (currency_code = upper(currency_code) and length(currency_code) = 3),
  transaction_at timestamptz not null,
  reference_no text null,
  notes text null,
  base_currency_code varchar(3) null check (base_currency_code is null or (base_currency_code = upper(base_currency_code) and length(base_currency_code) = 3)),
  base_amount numeric(18,4) null check (base_amount is null or base_amount > 0),
  fx_rate numeric(24,10) null check (fx_rate is null or fx_rate > 0),
  fx_rate_source text null,
  fx_rate_id uuid null references public.finance_fx_rates(id) on update cascade on delete restrict,
  reversal_of_transaction_id uuid null references public.finance_transactions(id) on update cascade on delete restrict,
  posted_at timestamptz null,
  posted_by uuid null references public.profiles(id) on delete set null,
  voided_at timestamptz null,
  voided_by uuid null references public.profiles(id) on delete set null,
  void_reason text null,
  created_by uuid null references public.profiles(id) on delete set null,
  updated_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_transactions_distinct_accounts check (source_account_id is null or destination_account_id is null or source_account_id <> destination_account_id),
  constraint finance_transactions_reversal_shape check (
    (transaction_kind = 'reversal' and reversal_of_transaction_id is not null)
    or (transaction_kind <> 'reversal' and reversal_of_transaction_id is null)
  ),
  constraint finance_transactions_post_snapshot check (
    (status = 'draft' and base_currency_code is null and base_amount is null and posted_at is null)
    or
    (status in ('posted','voided') and base_currency_code is not null and base_amount is not null and posted_at is not null)
  )
);

create index finance_transactions_source_account_idx on public.finance_transactions(source_account_id, transaction_at desc) where source_account_id is not null;
create index finance_transactions_destination_account_idx on public.finance_transactions(destination_account_id, transaction_at desc) where destination_account_id is not null;
create index finance_transactions_status_date_idx on public.finance_transactions(status, transaction_at desc, created_at desc);
create index finance_transactions_kind_date_idx on public.finance_transactions(transaction_kind, transaction_at desc);
create index finance_transactions_category_idx on public.finance_transactions(category_id, transaction_at desc) where category_id is not null;
create index finance_transactions_reversal_idx on public.finance_transactions(reversal_of_transaction_id) where reversal_of_transaction_id is not null;
create index finance_transactions_created_by_idx on public.finance_transactions(created_by) where created_by is not null;
create index finance_transactions_posted_by_idx on public.finance_transactions(posted_by) where posted_by is not null;
create index finance_transactions_voided_by_idx on public.finance_transactions(voided_by) where voided_by is not null;

create table public.finance_transaction_links (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.finance_transactions(id) on update cascade on delete restrict,
  project_id uuid null references public.customer_projects(id) on update cascade on delete restrict,
  order_id uuid null references public.customer_orders(id) on update cascade on delete restrict,
  customer_id uuid null references public.customers(id) on update cascade on delete restrict,
  employee_id uuid null references public.hr_employees(id) on update cascade on delete restrict,
  vendor_code text null,
  source_document_type text null,
  source_document_id uuid null,
  allocated_amount numeric(18,4) not null check (allocated_amount > 0),
  notes text null,
  created_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint finance_transaction_links_context_check check (
    project_id is not null or order_id is not null or customer_id is not null or employee_id is not null
    or nullif(btrim(coalesce(vendor_code,'')), '') is not null
    or source_document_id is not null
  ),
  constraint finance_transaction_links_source_pair_check check (
    (source_document_type is null and source_document_id is null)
    or (nullif(btrim(coalesce(source_document_type,'')), '') is not null and source_document_id is not null)
  )
);

create index finance_transaction_links_transaction_idx on public.finance_transaction_links(transaction_id, created_at);
create index finance_transaction_links_project_idx on public.finance_transaction_links(project_id, created_at) where project_id is not null;
create index finance_transaction_links_order_idx on public.finance_transaction_links(order_id, created_at) where order_id is not null;
create index finance_transaction_links_customer_idx on public.finance_transaction_links(customer_id, created_at) where customer_id is not null;
create index finance_transaction_links_employee_idx on public.finance_transaction_links(employee_id, created_at) where employee_id is not null;
create index finance_transaction_links_vendor_idx on public.finance_transaction_links(vendor_code, created_at) where vendor_code is not null;
create index finance_transaction_links_source_document_idx on public.finance_transaction_links(source_document_type, source_document_id) where source_document_id is not null;

create table public.finance_transaction_audit (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.finance_transactions(id) on update cascade on delete restrict,
  action_type text not null check (action_type in ('create','update','links','post','void','reverse')),
  before_snapshot jsonb null,
  after_snapshot jsonb null,
  reason text null,
  actor_id uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index finance_transaction_audit_transaction_idx on public.finance_transaction_audit(transaction_id, created_at desc);
create index finance_transaction_audit_actor_idx on public.finance_transaction_audit(actor_id, created_at desc) where actor_id is not null;

create table public.finance_idempotency_requests (
  id uuid primary key default gen_random_uuid(),
  operation text not null,
  idempotency_key uuid not null,
  request_fingerprint text not null,
  result_transaction_id uuid not null references public.finance_transactions(id) on update cascade on delete restrict,
  created_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint finance_idempotency_requests_operation_not_empty check (length(btrim(operation)) > 0),
  constraint finance_idempotency_requests_fingerprint_not_empty check (length(btrim(request_fingerprint)) > 0),
  constraint finance_idempotency_requests_unique_key unique (operation, idempotency_key)
);

create index finance_idempotency_requests_result_idx on public.finance_idempotency_requests(result_transaction_id);

alter table public.finance_accounts enable row level security;
alter table public.finance_categories enable row level security;
alter table public.finance_fx_rates enable row level security;
alter table public.finance_transactions enable row level security;
alter table public.finance_transaction_links enable row level security;
alter table public.finance_transaction_audit enable row level security;
alter table public.finance_idempotency_requests enable row level security;

create or replace function private.finance_assert_manage()
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null
     or not private.current_user_has_any_role(array['super_admin','admin','finance']::text[]) then
    raise exception 'Finance manage permission is required.' using errcode = '42501';
  end if;
end;
$function$;

create or replace function private.finance_assert_view()
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null
     or not private.current_user_has_any_role(array['super_admin','admin','finance']::text[]) then
    raise exception 'Finance view permission is required.' using errcode = '42501';
  end if;
end;
$function$;

create or replace function private.finance_base_currency()
returns varchar(3)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_currency varchar(3);
begin
  select upper(gs.default_currency::text)::varchar(3)
  into v_currency
  from public.general_settings gs
  order by gs.id
  limit 1;

  if v_currency is null or length(v_currency) <> 3 then
    raise exception 'Company default currency is not configured.' using errcode = '23514';
  end if;
  return v_currency;
end;
$function$;

create or replace function private.finance_idempotency_existing(
  p_operation text,
  p_idempotency_key uuid,
  p_request_fingerprint text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_existing public.finance_idempotency_requests%rowtype;
begin
  if p_idempotency_key is null then
    raise exception 'Idempotency key is required.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('finance:' || p_operation || ':' || p_idempotency_key::text, 0));

  select * into v_existing
  from public.finance_idempotency_requests r
  where r.operation = p_operation and r.idempotency_key = p_idempotency_key;

  if v_existing.id is null then
    return null;
  end if;
  if v_existing.request_fingerprint is distinct from p_request_fingerprint then
    raise exception 'Idempotency key was already used with a different Finance request.' using errcode = '22023';
  end if;
  return v_existing.result_transaction_id;
end;
$function$;

create or replace function private.finance_store_idempotency(
  p_operation text,
  p_idempotency_key uuid,
  p_request_fingerprint text,
  p_result_transaction_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.finance_idempotency_requests(operation, idempotency_key, request_fingerprint, result_transaction_id, created_by)
  values (p_operation, p_idempotency_key, p_request_fingerprint, p_result_transaction_id, auth.uid());
end;
$function$;

create or replace function private.validate_finance_transaction_shape()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_source public.finance_accounts%rowtype;
  v_destination public.finance_accounts%rowtype;
  v_category public.finance_categories%rowtype;
begin
  new.currency_code := upper(btrim(new.currency_code));
  new.reference_no := nullif(btrim(coalesce(new.reference_no,'')), '');
  new.notes := nullif(btrim(coalesce(new.notes,'')), '');

  if new.source_account_id is not null then
    select * into v_source from public.finance_accounts where id = new.source_account_id;
    if v_source.id is null or not v_source.is_active then
      raise exception 'Source Finance account is missing or inactive.' using errcode = '23514';
    end if;
    if v_source.currency_code is distinct from new.currency_code then
      raise exception 'Source Finance account currency must match transaction currency.' using errcode = '23514';
    end if;
  end if;

  if new.destination_account_id is not null then
    select * into v_destination from public.finance_accounts where id = new.destination_account_id;
    if v_destination.id is null or not v_destination.is_active then
      raise exception 'Destination Finance account is missing or inactive.' using errcode = '23514';
    end if;
    if v_destination.currency_code is distinct from new.currency_code then
      raise exception 'Destination Finance account currency must match transaction currency.' using errcode = '23514';
    end if;
  end if;

  if new.category_id is not null then
    select * into v_category from public.finance_categories where id = new.category_id;
    if v_category.id is null or not v_category.is_active then
      raise exception 'Finance category is missing or inactive.' using errcode = '23514';
    end if;
  end if;

  if new.transaction_kind = 'transfer' then
    if new.source_account_id is null or new.destination_account_id is null or new.source_account_id = new.destination_account_id then
      raise exception 'Transfer requires distinct source and destination Finance accounts.' using errcode = '23514';
    end if;
  elsif new.transaction_kind in ('expense','vendor_payment','employee_payment','withdrawal') then
    if new.source_account_id is null or new.destination_account_id is not null then
      raise exception 'This Finance transaction requires a source account only.' using errcode = '23514';
    end if;
  elsif new.transaction_kind in ('customer_receipt','deposit') then
    if new.destination_account_id is null or new.source_account_id is not null then
      raise exception 'This Finance transaction requires a destination account only.' using errcode = '23514';
    end if;
  elsif new.transaction_kind = 'refund' then
    if (new.source_account_id is null) = (new.destination_account_id is null) then
      raise exception 'Refund requires exactly one Finance account side.' using errcode = '23514';
    end if;
  elsif new.transaction_kind = 'reversal' then
    if new.reversal_of_transaction_id is null or (new.source_account_id is null and new.destination_account_id is null) then
      raise exception 'Reversal requires an original transaction and at least one Finance account side.' using errcode = '23514';
    end if;
  end if;

  if new.transaction_kind = 'expense' then
    if new.category_id is null then
      raise exception 'Expense requires a Finance category.' using errcode = '23514';
    end if;
    if v_category.category_type <> 'expense' then
      raise exception 'Expense requires an expense Finance category.' using errcode = '23514';
    end if;
  end if;

  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$function$;

create or replace function private.guard_finance_transaction_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'Posted Finance transactions are immutable; use void or reversal.' using errcode = '23514';
    end if;
    return old;
  end if;

  if old.status = 'voided' then
    raise exception 'Voided Finance transactions are immutable.' using errcode = '23514';
  end if;

  if old.status = 'posted' then
    if new.status <> 'voided'
       or new.transaction_kind is distinct from old.transaction_kind
       or new.source_account_id is distinct from old.source_account_id
       or new.destination_account_id is distinct from old.destination_account_id
       or new.category_id is distinct from old.category_id
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
       or new.voided_at is null
       or new.voided_by is null
       or nullif(btrim(coalesce(new.void_reason,'')), '') is null then
      raise exception 'Posted Finance transactions are immutable; only a guarded void transition is allowed.' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_validate_finance_transaction_shape on public.finance_transactions;
create trigger trg_validate_finance_transaction_shape
before insert or update on public.finance_transactions
for each row execute function private.validate_finance_transaction_shape();

drop trigger if exists trg_guard_finance_transaction_history on public.finance_transactions;
create trigger trg_guard_finance_transaction_history
before update or delete on public.finance_transactions
for each row execute function private.guard_finance_transaction_history();

create or replace function private.guard_finance_transaction_links()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_transaction_id uuid := coalesce(new.transaction_id, old.transaction_id);
  v_status text;
begin
  select t.status into v_status from public.finance_transactions t where t.id = v_transaction_id;
  if v_status is null then
    raise exception 'Finance transaction not found.' using errcode = '23503';
  end if;
  if v_status <> 'draft' then
    raise exception 'Finance transaction links are immutable after posting.' using errcode = '23514';
  end if;
  return coalesce(new, old);
end;
$function$;

drop trigger if exists trg_guard_finance_transaction_links on public.finance_transaction_links;
create trigger trg_guard_finance_transaction_links
before insert or update or delete on public.finance_transaction_links
for each row execute function private.guard_finance_transaction_links();

create or replace function private.guard_finance_append_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  raise exception 'Finance audit/idempotency history is append-only.' using errcode = '23514';
end;
$function$;

drop trigger if exists trg_guard_finance_transaction_audit on public.finance_transaction_audit;
create trigger trg_guard_finance_transaction_audit before update or delete on public.finance_transaction_audit
for each row execute function private.guard_finance_append_only();

drop trigger if exists trg_guard_finance_idempotency on public.finance_idempotency_requests;
create trigger trg_guard_finance_idempotency before update or delete on public.finance_idempotency_requests
for each row execute function private.guard_finance_append_only();

create or replace function private.create_finance_account(
  p_code text,
  p_name text,
  p_account_type text,
  p_currency_code text,
  p_institution_name text default null,
  p_reference_no text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare v_id uuid;
begin
  perform private.finance_assert_manage();
  if nullif(btrim(coalesce(p_code,'')), '') is null or nullif(btrim(coalesce(p_name,'')), '') is null then
    raise exception 'Finance account code and name are required.' using errcode = '22023';
  end if;
  if p_account_type not in ('bank','cash','clearing') then raise exception 'Invalid Finance account type.' using errcode = '22023'; end if;
  if p_currency_code is null or length(btrim(p_currency_code)) <> 3 then raise exception 'Currency must contain three letters.' using errcode = '22023'; end if;

  insert into public.finance_accounts(code,name,account_type,currency_code,institution_name,reference_no,created_by,updated_by)
  values (upper(btrim(p_code)), btrim(p_name), p_account_type, upper(btrim(p_currency_code)), nullif(btrim(coalesce(p_institution_name,'')),''), nullif(btrim(coalesce(p_reference_no,'')),''), auth.uid(), auth.uid())
  returning id into v_id;
  return v_id;
end;
$function$;

create or replace function private.update_finance_account(
  p_account_id uuid,
  p_name text,
  p_institution_name text default null,
  p_reference_no text default null,
  p_is_active boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform private.finance_assert_manage();
  if nullif(btrim(coalesce(p_name,'')), '') is null then raise exception 'Finance account name is required.' using errcode = '22023'; end if;
  update public.finance_accounts
  set name=btrim(p_name), institution_name=nullif(btrim(coalesce(p_institution_name,'')),''), reference_no=nullif(btrim(coalesce(p_reference_no,'')),''),
      is_active=coalesce(p_is_active,true), updated_by=auth.uid(), updated_at=now()
  where id=p_account_id;
  if not found then raise exception 'Finance account not found.'; end if;
  return p_account_id;
end;
$function$;

create or replace function private.create_finance_category(
  p_code text,
  p_name text,
  p_category_type text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare v_id uuid;
begin
  perform private.finance_assert_manage();
  if nullif(btrim(coalesce(p_code,'')), '') is null or nullif(btrim(coalesce(p_name,'')), '') is null then
    raise exception 'Finance category code and name are required.' using errcode = '22023';
  end if;
  if p_category_type not in ('expense','income') then raise exception 'Invalid Finance category type.' using errcode = '22023'; end if;
  insert into public.finance_categories(code,name,category_type,created_by,updated_by)
  values (upper(btrim(p_code)), btrim(p_name), p_category_type, auth.uid(), auth.uid()) returning id into v_id;
  return v_id;
end;
$function$;

create or replace function private.upsert_finance_fx_rate(
  p_from_currency text,
  p_to_currency text,
  p_rate numeric,
  p_rate_source text,
  p_observed_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare v_id uuid;
begin
  perform private.finance_assert_manage();
  if p_from_currency is null or p_to_currency is null or length(btrim(p_from_currency)) <> 3 or length(btrim(p_to_currency)) <> 3 then
    raise exception 'FX currencies must contain three letters.' using errcode='22023';
  end if;
  if upper(btrim(p_from_currency)) = upper(btrim(p_to_currency)) then raise exception 'FX currency pair must differ.' using errcode='22023'; end if;
  if p_rate is null or p_rate <= 0 then raise exception 'FX rate must be greater than zero.' using errcode='22023'; end if;
  if nullif(btrim(coalesce(p_rate_source,'')), '') is null or p_observed_at is null then raise exception 'FX source and observed time are required.' using errcode='22023'; end if;

  insert into public.finance_fx_rates(from_currency,to_currency,rate,rate_source,observed_at,created_by)
  values (upper(btrim(p_from_currency)),upper(btrim(p_to_currency)),p_rate,btrim(p_rate_source),p_observed_at,auth.uid())
  on conflict (from_currency,to_currency,rate_source,observed_at)
  do update set rate=excluded.rate, is_active=true
  returning id into v_id;
  return v_id;
end;
$function$;

create or replace function private.create_finance_transaction_draft(
  p_transaction_kind text,
  p_source_account_id uuid,
  p_destination_account_id uuid,
  p_category_id uuid,
  p_amount numeric,
  p_currency_code text,
  p_transaction_at timestamptz,
  p_reference_no text,
  p_notes text,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_id uuid;
  v_existing uuid;
  v_fingerprint text;
begin
  perform private.finance_assert_manage();
  v_fingerprint := md5(jsonb_build_object('kind',p_transaction_kind,'source',p_source_account_id,'destination',p_destination_account_id,'category',p_category_id,'amount',p_amount,'currency',upper(btrim(coalesce(p_currency_code,''))),'at',p_transaction_at,'reference',nullif(btrim(coalesce(p_reference_no,'')),''),'notes',nullif(btrim(coalesce(p_notes,'')),''))::text);
  v_existing := private.finance_idempotency_existing('create_draft',p_idempotency_key,v_fingerprint);
  if v_existing is not null then return v_existing; end if;

  insert into public.finance_transactions(transaction_kind,status,source_account_id,destination_account_id,category_id,amount,currency_code,transaction_at,reference_no,notes,created_by,updated_by)
  values (p_transaction_kind,'draft',p_source_account_id,p_destination_account_id,p_category_id,p_amount,upper(btrim(p_currency_code)),coalesce(p_transaction_at,now()),p_reference_no,p_notes,auth.uid(),auth.uid())
  returning id into v_id;

  insert into public.finance_transaction_audit(transaction_id,action_type,after_snapshot,actor_id)
  select v_id,'create',to_jsonb(t),auth.uid() from public.finance_transactions t where t.id=v_id;
  perform private.finance_store_idempotency('create_draft',p_idempotency_key,v_fingerprint,v_id);
  return v_id;
end;
$function$;

create or replace function private.update_finance_transaction_draft(
  p_transaction_id uuid,
  p_transaction_kind text,
  p_source_account_id uuid,
  p_destination_account_id uuid,
  p_category_id uuid,
  p_amount numeric,
  p_currency_code text,
  p_transaction_at timestamptz,
  p_reference_no text,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare v_before jsonb;
begin
  perform private.finance_assert_manage();
  select to_jsonb(t) into v_before from public.finance_transactions t where t.id=p_transaction_id and t.status='draft' for update;
  if v_before is null then raise exception 'Editable Finance draft not found.' using errcode='23514'; end if;

  update public.finance_transactions
  set transaction_kind=p_transaction_kind,source_account_id=p_source_account_id,destination_account_id=p_destination_account_id,
      category_id=p_category_id,amount=p_amount,currency_code=upper(btrim(p_currency_code)),transaction_at=p_transaction_at,
      reference_no=p_reference_no,notes=p_notes,updated_by=auth.uid(),updated_at=now()
  where id=p_transaction_id;

  insert into public.finance_transaction_audit(transaction_id,action_type,before_snapshot,after_snapshot,actor_id)
  select p_transaction_id,'update',v_before,to_jsonb(t),auth.uid() from public.finance_transactions t where t.id=p_transaction_id;
  return p_transaction_id;
end;
$function$;

create or replace function private.set_finance_transaction_links(
  p_transaction_id uuid,
  p_links jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_transaction public.finance_transactions%rowtype;
  v_item jsonb;
  v_total numeric(18,4) := 0;
  v_count integer := 0;
  v_project_id uuid;
  v_order_id uuid;
  v_customer_id uuid;
  v_employee_id uuid;
  v_vendor_code text;
  v_source_document_type text;
  v_source_document_id uuid;
  v_allocated numeric(18,4);
  v_order_project uuid;
  v_project_customer uuid;
begin
  perform private.finance_assert_manage();
  select * into v_transaction from public.finance_transactions where id=p_transaction_id for update;
  if v_transaction.id is null or v_transaction.status <> 'draft' then raise exception 'Finance links may only change on a draft transaction.' using errcode='23514'; end if;
  if p_links is null or jsonb_typeof(p_links) <> 'array' then raise exception 'Finance links must be a JSON array.' using errcode='22023'; end if;

  for v_item in select value from jsonb_array_elements(p_links)
  loop
    v_project_id := nullif(v_item->>'project_id','')::uuid;
    v_order_id := nullif(v_item->>'order_id','')::uuid;
    v_customer_id := nullif(v_item->>'customer_id','')::uuid;
    v_employee_id := nullif(v_item->>'employee_id','')::uuid;
    v_vendor_code := nullif(btrim(coalesce(v_item->>'vendor_code','')), '');
    v_source_document_type := nullif(btrim(coalesce(v_item->>'source_document_type','')), '');
    v_source_document_id := nullif(v_item->>'source_document_id','')::uuid;
    v_allocated := nullif(v_item->>'allocated_amount','')::numeric;

    if v_allocated is null or v_allocated <= 0 then raise exception 'Finance allocated amount must be greater than zero.' using errcode='22023'; end if;
    if v_project_id is null and v_order_id is null and v_customer_id is null and v_employee_id is null and v_vendor_code is null and v_source_document_id is null then
      raise exception 'Finance link requires at least one attribution/source reference.' using errcode='22023';
    end if;
    if (v_source_document_type is null) <> (v_source_document_id is null) then raise exception 'Finance source document type and id must be supplied together.' using errcode='22023'; end if;

    if v_order_id is not null and v_project_id is not null then
      select o.project_id into v_order_project from public.customer_orders o where o.id=v_order_id;
      if v_order_project is distinct from v_project_id then raise exception 'Finance Order/Project attribution does not match.' using errcode='23514'; end if;
    end if;
    if v_project_id is not null and v_customer_id is not null then
      select p.customer_id into v_project_customer from public.customer_projects p where p.id=v_project_id;
      if v_project_customer is distinct from v_customer_id then raise exception 'Finance Project/Customer attribution does not match.' using errcode='23514'; end if;
    end if;

    v_total := v_total + v_allocated;
  end loop;

  if v_total > v_transaction.amount then raise exception 'Finance allocated_amount total cannot exceed transaction amount.' using errcode='23514'; end if;

  delete from public.finance_transaction_links where transaction_id=p_transaction_id;
  for v_item in select value from jsonb_array_elements(p_links)
  loop
    insert into public.finance_transaction_links(transaction_id,project_id,order_id,customer_id,employee_id,vendor_code,source_document_type,source_document_id,allocated_amount,notes,created_by)
    values (
      p_transaction_id,
      nullif(v_item->>'project_id','')::uuid,
      nullif(v_item->>'order_id','')::uuid,
      nullif(v_item->>'customer_id','')::uuid,
      nullif(v_item->>'employee_id','')::uuid,
      nullif(btrim(coalesce(v_item->>'vendor_code','')), ''),
      nullif(btrim(coalesce(v_item->>'source_document_type','')), ''),
      nullif(v_item->>'source_document_id','')::uuid,
      (v_item->>'allocated_amount')::numeric,
      nullif(btrim(coalesce(v_item->>'notes','')), ''),
      auth.uid()
    );
    v_count := v_count + 1;
  end loop;

  insert into public.finance_transaction_audit(transaction_id,action_type,after_snapshot,actor_id)
  values (p_transaction_id,'links',jsonb_build_object('links',coalesce(p_links,'[]'::jsonb)),auth.uid());
  return v_count;
end;
$function$;

create or replace function private.post_finance_transaction(
  p_transaction_id uuid,
  p_manual_fx_rate numeric default null,
  p_manual_fx_rate_source text default null,
  p_idempotency_key uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_transaction public.finance_transactions%rowtype;
  v_before jsonb;
  v_base_currency varchar(3);
  v_rate numeric(24,10);
  v_rate_source text;
  v_rate_id uuid;
  v_base_amount numeric(18,4);
  v_existing uuid;
  v_fingerprint text;
begin
  perform private.finance_assert_manage();
  v_fingerprint := md5(jsonb_build_object('transaction_id',p_transaction_id,'manual_rate',p_manual_fx_rate,'manual_source',nullif(btrim(coalesce(p_manual_fx_rate_source,'')),''))::text);
  v_existing := private.finance_idempotency_existing('post',p_idempotency_key,v_fingerprint);
  if v_existing is not null then return v_existing; end if;

  select * into v_transaction from public.finance_transactions where id=p_transaction_id for update;
  if v_transaction.id is null or v_transaction.status <> 'draft' then raise exception 'Only a Finance draft can be posted.' using errcode='23514'; end if;
  v_before := to_jsonb(v_transaction);
  v_base_currency := private.finance_base_currency();

  if v_transaction.currency_code = v_base_currency then
    if p_manual_fx_rate is not null then raise exception 'Same-currency Finance posting does not accept an FX rate.' using errcode='22023'; end if;
    v_rate := null;
    v_rate_source := 'same_currency';
    v_rate_id := null;
    v_base_amount := v_transaction.amount;
  elsif p_manual_fx_rate is not null then
    if p_manual_fx_rate <= 0 or nullif(btrim(coalesce(p_manual_fx_rate_source,'')), '') is null then
      raise exception 'Manual FX rate and source are required for a manual Finance conversion.' using errcode='22023';
    end if;
    v_rate := p_manual_fx_rate;
    v_rate_source := 'manual:' || btrim(p_manual_fx_rate_source);
    v_rate_id := null;
    v_base_amount := round(v_transaction.amount * v_rate,4);
  else
    select r.rate,r.rate_source,r.id into v_rate,v_rate_source,v_rate_id
    from public.finance_fx_rates r
    where r.from_currency=v_transaction.currency_code and r.to_currency=v_base_currency and r.is_active and r.observed_at <= v_transaction.transaction_at
    order by r.observed_at desc,r.created_at desc limit 1;
    if v_rate is null then raise exception 'No eligible transaction-time FX rate exists for this Finance posting.' using errcode='23514'; end if;
    v_base_amount := round(v_transaction.amount * v_rate,4);
  end if;

  update public.finance_transactions
  set status='posted',base_currency_code=v_base_currency,base_amount=v_base_amount,fx_rate=v_rate,fx_rate_source=v_rate_source,fx_rate_id=v_rate_id,
      posted_at=now(),posted_by=auth.uid(),updated_at=now(),updated_by=auth.uid()
  where id=p_transaction_id;

  insert into public.finance_transaction_audit(transaction_id,action_type,before_snapshot,after_snapshot,actor_id)
  select p_transaction_id,'post',v_before,to_jsonb(t),auth.uid() from public.finance_transactions t where t.id=p_transaction_id;
  perform private.finance_store_idempotency('post',p_idempotency_key,v_fingerprint,p_transaction_id);
  return p_transaction_id;
end;
$function$;

create or replace function private.void_finance_transaction(
  p_transaction_id uuid,
  p_reason text,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_transaction public.finance_transactions%rowtype;
  v_before jsonb;
  v_existing uuid;
  v_fingerprint text;
begin
  perform private.finance_assert_manage();
  if nullif(btrim(coalesce(p_reason,'')), '') is null then raise exception 'Finance void reason is required.' using errcode='22023'; end if;
  v_fingerprint := md5(jsonb_build_object('transaction_id',p_transaction_id,'reason',btrim(p_reason))::text);
  v_existing := private.finance_idempotency_existing('void',p_idempotency_key,v_fingerprint);
  if v_existing is not null then return v_existing; end if;

  select * into v_transaction from public.finance_transactions where id=p_transaction_id for update;
  if v_transaction.id is null or v_transaction.status <> 'posted' then raise exception 'Only a posted Finance transaction can be voided.' using errcode='23514'; end if;
  if v_transaction.transaction_kind='reversal' or exists(select 1 from public.finance_transactions r where r.reversal_of_transaction_id=p_transaction_id and r.status='posted') then
    raise exception 'Finance transaction with reversal history cannot be voided; use another reversal.' using errcode='23514';
  end if;
  v_before := to_jsonb(v_transaction);

  update public.finance_transactions
  set status='voided',voided_at=now(),voided_by=auth.uid(),void_reason=btrim(p_reason),updated_at=now(),updated_by=auth.uid()
  where id=p_transaction_id;

  insert into public.finance_transaction_audit(transaction_id,action_type,before_snapshot,after_snapshot,reason,actor_id)
  select p_transaction_id,'void',v_before,to_jsonb(t),btrim(p_reason),auth.uid() from public.finance_transactions t where t.id=p_transaction_id;
  perform private.finance_store_idempotency('void',p_idempotency_key,v_fingerprint,p_transaction_id);
  return p_transaction_id;
end;
$function$;

create or replace function private.reverse_finance_transaction(
  p_transaction_id uuid,
  p_reason text,
  p_idempotency_key uuid
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
  if nullif(btrim(coalesce(p_reason,'')), '') is null then raise exception 'Finance reversal reason is required.' using errcode='22023'; end if;
  v_fingerprint := md5(jsonb_build_object('transaction_id',p_transaction_id,'reason',btrim(p_reason))::text);
  v_existing := private.finance_idempotency_existing('reverse',p_idempotency_key,v_fingerprint);
  if v_existing is not null then return v_existing; end if;

  select * into v_original from public.finance_transactions where id=p_transaction_id for update;
  if v_original.id is null or v_original.status <> 'posted' then raise exception 'Only a posted Finance transaction can be reversed.' using errcode='23514'; end if;
  if exists(select 1 from public.finance_transactions r where r.reversal_of_transaction_id=p_transaction_id and r.status='posted') then
    raise exception 'Finance transaction has already been reversed.' using errcode='23514';
  end if;

  insert into public.finance_transactions(transaction_kind,status,source_account_id,destination_account_id,category_id,amount,currency_code,transaction_at,reference_no,notes,reversal_of_transaction_id,created_by,updated_by)
  values ('reversal','draft',v_original.destination_account_id,v_original.source_account_id,v_original.category_id,v_original.amount,v_original.currency_code,now(),v_original.reference_no,btrim(p_reason),v_original.id,auth.uid(),auth.uid())
  returning id into v_reversal_id;

  insert into public.finance_transaction_links(transaction_id,project_id,order_id,customer_id,employee_id,vendor_code,source_document_type,source_document_id,allocated_amount,notes,created_by)
  select v_reversal_id,l.project_id,l.order_id,l.customer_id,l.employee_id,l.vendor_code,l.source_document_type,l.source_document_id,l.allocated_amount,l.notes,auth.uid()
  from public.finance_transaction_links l where l.transaction_id=p_transaction_id;

  update public.finance_transactions
  set status='posted',base_currency_code=v_original.base_currency_code,base_amount=v_original.base_amount,fx_rate=v_original.fx_rate,
      fx_rate_source=coalesce(v_original.fx_rate_source,'reversal_snapshot'),fx_rate_id=v_original.fx_rate_id,posted_at=now(),posted_by=auth.uid(),updated_at=now(),updated_by=auth.uid()
  where id=v_reversal_id;

  insert into public.finance_transaction_audit(transaction_id,action_type,after_snapshot,reason,actor_id)
  select v_reversal_id,'reverse',to_jsonb(t),btrim(p_reason),auth.uid() from public.finance_transactions t where t.id=v_reversal_id;
  perform private.finance_store_idempotency('reverse',p_idempotency_key,v_fingerprint,v_reversal_id);
  return v_reversal_id;
end;
$function$;

create or replace function public.get_finance_accounts()
returns table (
  id uuid, code text, name text, account_type text, currency_code varchar(3), institution_name text,
  reference_no text, is_active boolean, balance numeric(18,4), created_at timestamptz, updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  perform private.finance_assert_view();
  return query
  select a.id,a.code,a.name,a.account_type,a.currency_code,a.institution_name,a.reference_no,a.is_active,
    round(coalesce(sum(case when t.status='posted' and t.destination_account_id=a.id then t.amount when t.status='posted' and t.source_account_id=a.id then -t.amount else 0 end),0),4)::numeric(18,4) as balance,
    a.created_at,a.updated_at
  from public.finance_accounts a
  left join public.finance_transactions t on t.source_account_id=a.id or t.destination_account_id=a.id
  group by a.id
  order by a.is_active desc,a.name,a.id;
end;
$function$;

create or replace function public.get_finance_categories()
returns setof public.finance_categories
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  perform private.finance_assert_view();
  return query select * from public.finance_categories c order by c.is_active desc,c.category_type,c.name,c.id;
end;
$function$;

create or replace function public.get_finance_fx_rates(p_limit integer default 100)
returns setof public.finance_fx_rates
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  perform private.finance_assert_view();
  return query select * from public.finance_fx_rates r where r.is_active order by r.observed_at desc,r.id desc limit least(greatest(coalesce(p_limit,100),1),500);
end;
$function$;

create or replace function public.get_finance_transactions_page(
  p_limit integer default 50,
  p_offset integer default 0,
  p_status text default null,
  p_kind text default null,
  p_account_id uuid default null,
  p_search text default null
)
returns table (
  id uuid, transaction_kind text, status text, source_account_id uuid, source_account_name text,
  destination_account_id uuid, destination_account_name text, category_id uuid, category_name text,
  amount numeric(18,4), currency_code varchar(3), transaction_at timestamptz, reference_no text, notes text,
  base_currency_code varchar(3), base_amount numeric(18,4), fx_rate numeric(24,10), fx_rate_source text,
  reversal_of_transaction_id uuid, posted_at timestamptz, voided_at timestamptz, void_reason text,
  created_at timestamptz, total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  perform private.finance_assert_view();
  return query
  select t.id,t.transaction_kind,t.status,t.source_account_id,sa.name,t.destination_account_id,da.name,t.category_id,c.name,
    t.amount,t.currency_code,t.transaction_at,t.reference_no,t.notes,t.base_currency_code,t.base_amount,t.fx_rate,t.fx_rate_source,
    t.reversal_of_transaction_id,t.posted_at,t.voided_at,t.void_reason,t.created_at,count(*) over()
  from public.finance_transactions t
  left join public.finance_accounts sa on sa.id=t.source_account_id
  left join public.finance_accounts da on da.id=t.destination_account_id
  left join public.finance_categories c on c.id=t.category_id
  where (p_status is null or t.status=p_status)
    and (p_kind is null or t.transaction_kind=p_kind)
    and (p_account_id is null or t.source_account_id=p_account_id or t.destination_account_id=p_account_id)
    and (nullif(btrim(coalesce(p_search,'')),'') is null or coalesce(t.reference_no,'') ilike '%'||btrim(p_search)||'%' or coalesce(t.notes,'') ilike '%'||btrim(p_search)||'%')
  order by t.transaction_at desc,t.created_at desc,t.id desc
  limit least(greatest(coalesce(p_limit,50),1),200) offset greatest(coalesce(p_offset,0),0);
end;
$function$;

create or replace function public.get_finance_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare v_result jsonb; v_base varchar(3);
begin
  perform private.finance_assert_view();
  v_base := private.finance_base_currency();
  select jsonb_build_object(
    'base_currency',v_base,
    'active_account_count',(select count(*) from public.finance_accounts where is_active),
    'draft_transaction_count',(select count(*) from public.finance_transactions where status='draft'),
    'posted_transaction_count',(select count(*) from public.finance_transactions where status='posted'),
    'account_balances',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'name',a.name,'type',a.account_type,'currency_code',a.currency_code,'balance',a.balance) order by a.name) from public.get_finance_accounts() a where a.is_active),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$function$;

create or replace function public.create_finance_account(p_code text,p_name text,p_account_type text,p_currency_code text,p_institution_name text default null,p_reference_no text default null)
returns uuid language sql set search_path='pg_catalog','private' as $function$ select private.create_finance_account($1,$2,$3,$4,$5,$6); $function$;
create or replace function public.update_finance_account(p_account_id uuid,p_name text,p_institution_name text default null,p_reference_no text default null,p_is_active boolean default true)
returns uuid language sql set search_path='pg_catalog','private' as $function$ select private.update_finance_account($1,$2,$3,$4,$5); $function$;
create or replace function public.create_finance_category(p_code text,p_name text,p_category_type text)
returns uuid language sql set search_path='pg_catalog','private' as $function$ select private.create_finance_category($1,$2,$3); $function$;
create or replace function public.upsert_finance_fx_rate(p_from_currency text,p_to_currency text,p_rate numeric,p_rate_source text,p_observed_at timestamptz)
returns uuid language sql set search_path='pg_catalog','private' as $function$ select private.upsert_finance_fx_rate($1,$2,$3,$4,$5); $function$;
create or replace function public.create_finance_transaction_draft(p_transaction_kind text,p_source_account_id uuid,p_destination_account_id uuid,p_category_id uuid,p_amount numeric,p_currency_code text,p_transaction_at timestamptz,p_reference_no text,p_notes text,p_idempotency_key uuid)
returns uuid language sql set search_path='pg_catalog','private' as $function$ select private.create_finance_transaction_draft($1,$2,$3,$4,$5,$6,$7,$8,$9,$10); $function$;
create or replace function public.update_finance_transaction_draft(p_transaction_id uuid,p_transaction_kind text,p_source_account_id uuid,p_destination_account_id uuid,p_category_id uuid,p_amount numeric,p_currency_code text,p_transaction_at timestamptz,p_reference_no text,p_notes text)
returns uuid language sql set search_path='pg_catalog','private' as $function$ select private.update_finance_transaction_draft($1,$2,$3,$4,$5,$6,$7,$8,$9,$10); $function$;
create or replace function public.set_finance_transaction_links(p_transaction_id uuid,p_links jsonb)
returns integer language sql set search_path='pg_catalog','private' as $function$ select private.set_finance_transaction_links($1,$2); $function$;
create or replace function public.post_finance_transaction(p_transaction_id uuid,p_manual_fx_rate numeric default null,p_manual_fx_rate_source text default null,p_idempotency_key uuid default null)
returns uuid language sql set search_path='pg_catalog','private' as $function$ select private.post_finance_transaction($1,$2,$3,$4); $function$;
create or replace function public.void_finance_transaction(p_transaction_id uuid,p_reason text,p_idempotency_key uuid)
returns uuid language sql set search_path='pg_catalog','private' as $function$ select private.void_finance_transaction($1,$2,$3); $function$;
create or replace function public.reverse_finance_transaction(p_transaction_id uuid,p_reason text,p_idempotency_key uuid)
returns uuid language sql set search_path='pg_catalog','private' as $function$ select private.reverse_finance_transaction($1,$2,$3); $function$;

-- Finance reads are RLS-visible for Finance/Admin. Money/audit writes remain RPC-only.
drop policy if exists finance_accounts_read on public.finance_accounts;
create policy finance_accounts_read on public.finance_accounts for select to authenticated
using ((select public.current_user_has_any_role(array['super_admin','admin','finance']::text[])));
drop policy if exists finance_categories_read on public.finance_categories;
create policy finance_categories_read on public.finance_categories for select to authenticated
using ((select public.current_user_has_any_role(array['super_admin','admin','finance']::text[])));
drop policy if exists finance_fx_rates_read on public.finance_fx_rates;
create policy finance_fx_rates_read on public.finance_fx_rates for select to authenticated
using ((select public.current_user_has_any_role(array['super_admin','admin','finance']::text[])));
drop policy if exists finance_transactions_read on public.finance_transactions;
create policy finance_transactions_read on public.finance_transactions for select to authenticated
using ((select public.current_user_has_any_role(array['super_admin','admin','finance']::text[])));
drop policy if exists finance_transaction_links_read on public.finance_transaction_links;
create policy finance_transaction_links_read on public.finance_transaction_links for select to authenticated
using ((select public.current_user_has_any_role(array['super_admin','admin','finance']::text[])));
drop policy if exists finance_transaction_audit_read on public.finance_transaction_audit;
create policy finance_transaction_audit_read on public.finance_transaction_audit for select to authenticated
using ((select public.current_user_has_any_role(array['super_admin','admin','finance']::text[])));

revoke all on table public.finance_accounts,public.finance_categories,public.finance_fx_rates,public.finance_transactions,public.finance_transaction_links,public.finance_transaction_audit,public.finance_idempotency_requests from anon,authenticated;
grant select on table public.finance_accounts,public.finance_categories,public.finance_fx_rates,public.finance_transactions,public.finance_transaction_links,public.finance_transaction_audit to authenticated;
revoke insert, update, delete, truncate on table public.finance_transactions,public.finance_transaction_links,public.finance_transaction_audit,public.finance_idempotency_requests from authenticated,anon;
revoke insert, update, delete, truncate on table public.finance_accounts,public.finance_categories,public.finance_fx_rates from authenticated,anon;

revoke all on function private.finance_assert_manage() from public,anon,authenticated;
revoke all on function private.finance_assert_view() from public,anon,authenticated;
revoke all on function private.finance_base_currency() from public,anon,authenticated;
revoke all on function private.finance_idempotency_existing(text,uuid,text) from public,anon,authenticated;
revoke all on function private.finance_store_idempotency(text,uuid,text,uuid) from public,anon,authenticated;
revoke all on function private.create_finance_account(text,text,text,text,text,text) from public,anon,authenticated;
revoke all on function private.update_finance_account(uuid,text,text,text,boolean) from public,anon,authenticated;
revoke all on function private.create_finance_category(text,text,text) from public,anon,authenticated;
revoke all on function private.upsert_finance_fx_rate(text,text,numeric,text,timestamptz) from public,anon,authenticated;
revoke all on function private.create_finance_transaction_draft(text,uuid,uuid,uuid,numeric,text,timestamptz,text,text,uuid) from public,anon,authenticated;
revoke all on function private.update_finance_transaction_draft(uuid,text,uuid,uuid,uuid,numeric,text,timestamptz,text,text) from public,anon,authenticated;
revoke all on function private.set_finance_transaction_links(uuid,jsonb) from public,anon,authenticated;
revoke all on function private.post_finance_transaction(uuid,numeric,text,uuid) from public,anon,authenticated;
revoke all on function private.void_finance_transaction(uuid,text,uuid) from public,anon,authenticated;
revoke all on function private.reverse_finance_transaction(uuid,text,uuid) from public,anon,authenticated;
revoke all on function private.validate_finance_transaction_shape() from public,anon,authenticated;
revoke all on function private.guard_finance_transaction_history() from public,anon,authenticated;
revoke all on function private.guard_finance_transaction_links() from public,anon,authenticated;
revoke all on function private.guard_finance_append_only() from public,anon,authenticated;

revoke all on function public.get_finance_accounts() from public,anon;
revoke all on function public.get_finance_categories() from public,anon;
revoke all on function public.get_finance_fx_rates(integer) from public,anon;
revoke all on function public.get_finance_transactions_page(integer,integer,text,text,uuid,text) from public,anon;
revoke all on function public.get_finance_overview() from public,anon;
revoke all on function public.create_finance_account(text,text,text,text,text,text) from public,anon;
revoke all on function public.update_finance_account(uuid,text,text,text,boolean) from public,anon;
revoke all on function public.create_finance_category(text,text,text) from public,anon;
revoke all on function public.upsert_finance_fx_rate(text,text,numeric,text,timestamptz) from public,anon;
revoke all on function public.create_finance_transaction_draft(text,uuid,uuid,uuid,numeric,text,timestamptz,text,text,uuid) from public,anon;
revoke all on function public.update_finance_transaction_draft(uuid,text,uuid,uuid,uuid,numeric,text,timestamptz,text,text) from public,anon;
revoke all on function public.set_finance_transaction_links(uuid,jsonb) from public,anon;
revoke all on function public.post_finance_transaction(uuid,numeric,text,uuid) from public,anon;
revoke all on function public.void_finance_transaction(uuid,text,uuid) from public,anon;
revoke all on function public.reverse_finance_transaction(uuid,text,uuid) from public,anon;

grant execute on function public.get_finance_accounts() to authenticated;
grant execute on function public.get_finance_categories() to authenticated;
grant execute on function public.get_finance_fx_rates(integer) to authenticated;
grant execute on function public.get_finance_transactions_page(integer,integer,text,text,uuid,text) to authenticated;
grant execute on function public.get_finance_overview() to authenticated;
grant execute on function public.create_finance_account(text,text,text,text,text,text) to authenticated;
grant execute on function public.update_finance_account(uuid,text,text,text,boolean) to authenticated;
grant execute on function public.create_finance_category(text,text,text) to authenticated;
grant execute on function public.upsert_finance_fx_rate(text,text,numeric,text,timestamptz) to authenticated;
grant execute on function public.create_finance_transaction_draft(text,uuid,uuid,uuid,numeric,text,timestamptz,text,text,uuid) to authenticated;
grant execute on function public.update_finance_transaction_draft(uuid,text,uuid,uuid,uuid,numeric,text,timestamptz,text,text) to authenticated;
grant execute on function public.set_finance_transaction_links(uuid,jsonb) to authenticated;
grant execute on function public.post_finance_transaction(uuid,numeric,text,uuid) to authenticated;
grant execute on function public.void_finance_transaction(uuid,text,uuid) to authenticated;
grant execute on function public.reverse_finance_transaction(uuid,text,uuid) to authenticated;

notify pgrst, 'reload schema';
