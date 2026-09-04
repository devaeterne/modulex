-- A6-F2: bridge existing company_expenses source documents into Finance Core.
-- Existing company_expenses remains the source-document/history table.
-- Actual money movement is owned by finance_transactions; no parallel expense ledger is created.

alter table public.company_expenses
  add column if not exists finance_category_id uuid null
    references public.finance_categories(id) on update cascade on delete restrict;

-- Preserve legacy category text as a historical/display snapshot while linking new work
-- to the canonical Finance category. Existing rows must map deterministically or rollout
-- fails closed for manual review.
update public.company_expenses e
set finance_category_id = c.id
from public.finance_categories c
where e.finance_category_id is null
  and c.category_type = 'expense'
  and (
    lower(btrim(e.category)) = lower(btrim(c.code))
    or lower(btrim(e.category)) = lower(btrim(c.name))
  );

do $$
begin
  if exists (
    select 1
    from public.company_expenses e
    where e.finance_category_id is null
  ) then
    raise exception 'A6-F2 cannot map every existing company expense to a canonical Finance expense category.';
  end if;
end
$$;

alter table public.company_expenses
  alter column finance_category_id set not null;

create index if not exists company_expenses_finance_category_idx
  on public.company_expenses(finance_category_id, expense_date desc);

alter table public.company_expenses
  drop constraint if exists company_expenses_status_check;

alter table public.company_expenses
  add constraint company_expenses_status_check
  check (status in ('draft','posted','void'));

create or replace function private.company_expense_transaction_at(p_expense_date date)
returns timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_timezone text;
begin
  if p_expense_date is null then
    raise exception 'Expense date is required.' using errcode = '22023';
  end if;

  select nullif(btrim(gs.timezone), '')
  into v_timezone
  from public.general_settings gs
  order by gs.id
  limit 1;

  return p_expense_date::timestamp at time zone coalesce(v_timezone, 'UTC');
end;
$function$;

create or replace function private.get_company_expense_finance_transaction(p_expense_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_transaction_id uuid;
  v_count integer;
begin
  select count(*)
  into v_count
  from public.finance_transaction_links l
  join public.finance_transactions t on t.id = l.transaction_id
  where l.source_document_type = 'company_expense'
    and l.source_document_id = p_expense_id
    and t.transaction_kind = 'expense'
    and t.reversal_of_transaction_id is null;

  select t.id
  into v_transaction_id
  from public.finance_transaction_links l
  join public.finance_transactions t on t.id = l.transaction_id
  where l.source_document_type = 'company_expense'
    and l.source_document_id = p_expense_id
    and t.transaction_kind = 'expense'
    and t.reversal_of_transaction_id is null
  order by t.created_at asc, t.id asc
  limit 1;

  if v_count > 1 then
    raise exception 'Company expense has multiple original Finance transactions.' using errcode = '23514';
  end if;

  return v_transaction_id;
end;
$function$;

create or replace function private.guard_company_expense_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_sync text := current_setting('modulex.company_expense_sync', true);
  v_delete text := current_setting('modulex.company_expense_draft_delete', true);
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' or v_delete is distinct from old.id::text then
      raise exception 'Only a Finance-managed company expense draft can be deleted.' using errcode = '23514';
    end if;
    return old;
  end if;

  if old.status = 'void' then
    raise exception 'Voided company expenses are immutable.' using errcode = '23514';
  end if;

  if old.status = 'posted' and (
    new.expense_date is distinct from old.expense_date
    or new.finance_category_id is distinct from old.finance_category_id
    or new.category is distinct from old.category
    or new.vendor is distinct from old.vendor
    or new.description is distinct from old.description
    or new.amount is distinct from old.amount
    or new.currency_code is distinct from old.currency_code
    or new.reference_no is distinct from old.reference_no
    or new.notes is distinct from old.notes
  ) then
    raise exception 'Posted company expense source data is immutable; use Finance correction semantics.' using errcode = '23514';
  end if;

  if new.status is distinct from old.status and v_sync is distinct from old.id::text then
    raise exception 'Company expense status is Finance-managed.' using errcode = '23514';
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_company_expenses_history_guard on public.company_expenses;
create trigger trg_company_expenses_history_guard
before update or delete on public.company_expenses
for each row execute function private.guard_company_expense_history();

create or replace function private.guard_company_expense_finance_transaction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_expense_id uuid;
  v_mutation text := current_setting('modulex.company_expense_transaction_mutation', true);
begin
  if tg_op = 'INSERT' then
    if new.transaction_kind = 'expense' and v_mutation is distinct from 'create' then
      raise exception 'Create operational expenses through the Company Expense Finance flow.' using errcode = '23514';
    end if;
    return new;
  end if;

  select l.source_document_id
  into v_expense_id
  from public.finance_transaction_links l
  where l.transaction_id = old.id
    and l.source_document_type = 'company_expense'
  order by l.created_at asc
  limit 1;

  if v_expense_id is null or old.transaction_kind <> 'expense' or old.reversal_of_transaction_id is not null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    if v_mutation is distinct from v_expense_id::text then
      raise exception 'Company expense Finance drafts must be deleted through the Company Expense flow.' using errcode = '23514';
    end if;
    return old;
  end if;

  if old.status = 'draft' and new.status = 'draft' and (
    new.transaction_kind is distinct from old.transaction_kind
    or new.source_account_id is distinct from old.source_account_id
    or new.destination_account_id is distinct from old.destination_account_id
    or new.category_id is distinct from old.category_id
    or new.amount is distinct from old.amount
    or new.currency_code is distinct from old.currency_code
    or new.transaction_at is distinct from old.transaction_at
    or new.reference_no is distinct from old.reference_no
    or new.notes is distinct from old.notes
  ) and v_mutation is distinct from v_expense_id::text then
    raise exception 'Company expense Finance drafts must be edited through the Company Expense flow.' using errcode = '23514';
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_guard_company_expense_finance_transaction on public.finance_transactions;
create trigger trg_guard_company_expense_finance_transaction
before insert or update or delete on public.finance_transactions
for each row execute function private.guard_company_expense_finance_transaction();

create or replace function private.guard_company_expense_finance_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_expense_id uuid;
  v_transaction_id uuid;
  v_transaction_kind text;
  v_mutation text := current_setting('modulex.company_expense_transaction_mutation', true);
begin
  if tg_op = 'DELETE' then
    v_expense_id := old.source_document_id;
    v_transaction_id := old.transaction_id;
    if old.source_document_type is distinct from 'company_expense' or v_expense_id is null then
      return old;
    end if;
  else
    v_expense_id := new.source_document_id;
    v_transaction_id := new.transaction_id;
    if new.source_document_type is distinct from 'company_expense' or v_expense_id is null then
      if tg_op = 'UPDATE'
         and old.source_document_type = 'company_expense'
         and old.source_document_id is not null
         and v_mutation is distinct from old.source_document_id::text then
        raise exception 'Company expense Finance source links are source-managed.' using errcode = '23514';
      end if;
      return new;
    end if;
  end if;

  select t.transaction_kind into v_transaction_kind
  from public.finance_transactions t
  where t.id = v_transaction_id;

  if tg_op = 'INSERT' and v_transaction_kind = 'reversal' then
    return new;
  end if;

  if v_mutation is distinct from v_expense_id::text then
    raise exception 'Company expense Finance source links are source-managed.' using errcode = '23514';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

drop trigger if exists trg_guard_company_expense_finance_link on public.finance_transaction_links;
create trigger trg_guard_company_expense_finance_link
before insert or update or delete on public.finance_transaction_links
for each row execute function private.guard_company_expense_finance_link();

create or replace function private.validate_company_expense_finance_posting()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_expense_id uuid;
  v_source_count integer := 0;
  v_other_source_count integer := 0;
  v_allocated numeric(18,4) := 0;
  v_expense_status text;
begin
  if tg_op <> 'UPDATE'
     or old.status is distinct from 'draft'
     or new.status is distinct from 'posted'
     or new.transaction_kind <> 'expense' then
    return new;
  end if;

  select (array_agg(l.source_document_id order by l.created_at))[1],
         count(distinct l.source_document_id),
         count(*) filter (
           where l.source_document_type is distinct from 'company_expense'
              or l.source_document_id is null
         ),
         coalesce(sum(l.allocated_amount) filter (
           where l.source_document_type = 'company_expense'
         ), 0)::numeric(18,4)
  into v_expense_id, v_source_count, v_other_source_count, v_allocated
  from public.finance_transaction_links l
  where l.transaction_id = new.id;

  if v_source_count = 0 then
    raise exception 'Finance expense transaction must be linked to a company expense source before posting.' using errcode = '23514';
  end if;

  if v_source_count <> 1 or v_other_source_count <> 0 then
    raise exception 'Company expense Finance transaction must reference exactly one company_expense source on every allocation row.' using errcode = '23514';
  end if;

  if v_allocated is distinct from new.amount then
    raise exception 'Company expense Finance allocations must equal the transaction amount before posting.' using errcode = '23514';
  end if;

  select e.status into v_expense_status
  from public.company_expenses e
  where e.id = v_expense_id
    and e.finance_category_id = new.category_id
    and e.amount = new.amount
    and e.currency_code = new.currency_code
    and e.expense_date = (
      new.transaction_at at time zone coalesce(
        (select nullif(btrim(gs.timezone),'') from public.general_settings gs order by gs.id limit 1),
        'UTC'
      )
    )::date;

  if v_expense_status is distinct from 'draft' then
    raise exception 'Company expense source and Finance draft must match before posting.' using errcode = '23514';
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_validate_company_expense_finance_posting on public.finance_transactions;
create trigger trg_validate_company_expense_finance_posting
before update on public.finance_transactions
for each row execute function private.validate_company_expense_finance_posting();

create or replace function private.reconcile_company_expense_finance_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_expense_id uuid;
  v_target_status text;
begin
  if tg_op <> 'UPDATE' or old.status is not distinct from new.status then
    return new;
  end if;

  if old.status = 'draft' and new.status = 'posted' and new.transaction_kind = 'expense' then
    v_target_status := 'posted';
  elsif old.status = 'posted' and new.status = 'voided' and new.transaction_kind = 'expense' then
    v_target_status := 'void';
  elsif old.status = 'draft' and new.status = 'posted' and new.transaction_kind = 'reversal' then
    v_target_status := 'void';
  else
    return new;
  end if;

  for v_expense_id in
    select distinct l.source_document_id
    from public.finance_transaction_links l
    where l.transaction_id = new.id
      and l.source_document_type = 'company_expense'
      and l.source_document_id is not null
  loop
    perform set_config('modulex.company_expense_sync', v_expense_id::text, true);

    update public.company_expenses e
    set status = v_target_status,
        updated_by = auth.uid(),
        updated_at = now()
    where e.id = v_expense_id
      and e.status is distinct from v_target_status;

    perform set_config('modulex.company_expense_sync', '', true);
  end loop;

  return new;
end;
$function$;

drop trigger if exists trg_reconcile_company_expense_finance_after_change on public.finance_transactions;
create trigger trg_reconcile_company_expense_finance_after_change
after update on public.finance_transactions
for each row execute function private.reconcile_company_expense_finance_after_change();

create or replace function private.get_company_expenses_page(
  p_limit integer default 50,
  p_offset integer default 0,
  p_status text default null,
  p_category_id uuid default null,
  p_search text default null,
  p_from date default null,
  p_to date default null
)
returns table(
  id uuid,
  expense_date date,
  finance_category_id uuid,
  category_name text,
  category_snapshot text,
  vendor text,
  description text,
  amount numeric,
  currency_code varchar,
  reference_no text,
  notes text,
  status text,
  finance_transaction_id uuid,
  finance_transaction_status text,
  source_account_id uuid,
  source_account_name text,
  base_currency_code varchar,
  base_amount numeric,
  created_at timestamptz,
  updated_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  perform private.finance_assert_view();

  if p_status is not null and p_status not in ('draft','posted','void') then
    raise exception 'Invalid company expense status filter.' using errcode = '22023';
  end if;
  if p_from is not null and p_to is not null and p_to < p_from then
    raise exception 'End date cannot be before start date.' using errcode = '22023';
  end if;

  return query
  select e.id,
         e.expense_date,
         e.finance_category_id,
         c.name,
         e.category,
         e.vendor,
         e.description,
         e.amount,
         e.currency_code,
         e.reference_no,
         e.notes,
         e.status,
         t.id,
         t.status,
         t.source_account_id,
         a.name,
         t.base_currency_code,
         t.base_amount,
         e.created_at,
         e.updated_at,
         count(*) over()
  from public.company_expenses e
  join public.finance_categories c on c.id = e.finance_category_id
  left join lateral (
    select ft.*
    from public.finance_transaction_links l
    join public.finance_transactions ft on ft.id = l.transaction_id
    where l.source_document_type = 'company_expense'
      and l.source_document_id = e.id
      and ft.transaction_kind = 'expense'
      and ft.reversal_of_transaction_id is null
    order by ft.created_at asc, ft.id asc
    limit 1
  ) t on true
  left join public.finance_accounts a on a.id = t.source_account_id
  where (p_status is null or e.status = p_status)
    and (p_category_id is null or e.finance_category_id = p_category_id)
    and (p_from is null or e.expense_date >= p_from)
    and (p_to is null or e.expense_date <= p_to)
    and (
      nullif(btrim(coalesce(p_search,'')), '') is null
      or e.description ilike '%' || btrim(p_search) || '%'
      or coalesce(e.vendor,'') ilike '%' || btrim(p_search) || '%'
      or coalesce(e.reference_no,'') ilike '%' || btrim(p_search) || '%'
      or c.name ilike '%' || btrim(p_search) || '%'
    )
  order by e.expense_date desc, e.created_at desc, e.id desc
  limit least(greatest(coalesce(p_limit,50),1),200)
  offset greatest(coalesce(p_offset,0),0);
end;
$function$;

create or replace function private.create_company_expense_draft(
  p_expense_date date,
  p_finance_category_id uuid,
  p_vendor text,
  p_description text,
  p_amount numeric,
  p_currency_code text,
  p_source_account_id uuid,
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
  v_category public.finance_categories%rowtype;
  v_transaction_id uuid;
  v_expense_id uuid;
  v_existing_expense_id uuid;
  v_notes text;
begin
  perform private.finance_assert_manage();

  if p_expense_date is null then
    raise exception 'Expense date is required.' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_description,'')), '') is null then
    raise exception 'Expense description is required.' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Expense amount must be greater than zero.' using errcode = '22023';
  end if;

  select * into v_category
  from public.finance_categories c
  where c.id = p_finance_category_id
    and c.category_type = 'expense'
    and c.is_active;

  if v_category.id is null then
    raise exception 'Active Finance expense category is required.' using errcode = '23514';
  end if;

  v_notes := btrim(p_description)
    || case when nullif(btrim(coalesce(p_notes,'')), '') is null
            then ''
            else E'\n' || btrim(p_notes)
       end;

  perform set_config('modulex.company_expense_transaction_mutation', 'create', true);
  v_transaction_id := private.create_finance_transaction_draft(
    'expense',
    p_source_account_id,
    null,
    p_finance_category_id,
    p_amount,
    upper(btrim(coalesce(p_currency_code,''))),
    private.company_expense_transaction_at(p_expense_date),
    nullif(btrim(coalesce(p_reference_no,'')), ''),
    v_notes,
    p_idempotency_key
  );
  perform set_config('modulex.company_expense_transaction_mutation', '', true);

  select l.source_document_id
  into v_existing_expense_id
  from public.finance_transaction_links l
  where l.transaction_id = v_transaction_id
    and l.source_document_type = 'company_expense'
  order by l.created_at asc
  limit 1;

  if v_existing_expense_id is not null then
    if exists (select 1 from public.company_expenses e where e.id = v_existing_expense_id) then
      return v_existing_expense_id;
    end if;
    raise exception 'Finance idempotency points to a missing company expense source.' using errcode = '23514';
  end if;

  insert into public.company_expenses(
    expense_date,
    finance_category_id,
    category,
    vendor,
    description,
    amount,
    currency_code,
    reference_no,
    notes,
    status,
    created_by,
    updated_by
  )
  values (
    p_expense_date,
    v_category.id,
    v_category.name,
    nullif(btrim(coalesce(p_vendor,'')), ''),
    btrim(p_description),
    p_amount,
    upper(btrim(coalesce(p_currency_code,''))),
    nullif(btrim(coalesce(p_reference_no,'')), ''),
    nullif(btrim(coalesce(p_notes,'')), ''),
    'draft',
    auth.uid(),
    auth.uid()
  )
  returning id into v_expense_id;

  perform set_config('modulex.company_expense_transaction_mutation', v_expense_id::text, true);
  perform private.set_finance_transaction_links(
    v_transaction_id,
    jsonb_build_array(
      jsonb_build_object(
        'source_document_type', 'company_expense',
        'source_document_id', v_expense_id,
        'allocated_amount', p_amount,
        'notes', 'Canonical company expense source'
      )
    )
  );
  perform set_config('modulex.company_expense_transaction_mutation', '', true);

  return v_expense_id;
end;
$function$;

create or replace function private.update_company_expense_draft(
  p_expense_id uuid,
  p_expense_date date,
  p_finance_category_id uuid,
  p_vendor text,
  p_description text,
  p_amount numeric,
  p_currency_code text,
  p_source_account_id uuid,
  p_reference_no text,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_expense public.company_expenses%rowtype;
  v_category public.finance_categories%rowtype;
  v_transaction_id uuid;
  v_links jsonb;
  v_link_count integer;
  v_allocated numeric(18,4);
  v_notes text;
begin
  perform private.finance_assert_manage();

  v_transaction_id := private.get_company_expense_finance_transaction(p_expense_id);
  if v_transaction_id is null then
    raise exception 'Company expense Finance draft is missing.' using errcode = '23514';
  end if;

  perform 1
  from public.finance_transactions t
  where t.id = v_transaction_id and t.status = 'draft'
  for update;

  if not found then
    raise exception 'Editable company expense Finance draft not found.' using errcode = '23514';
  end if;

  select * into v_expense
  from public.company_expenses e
  where e.id = p_expense_id
    and e.status = 'draft'
  for update;

  if v_expense.id is null then
    raise exception 'Editable company expense draft not found.' using errcode = '23514';
  end if;
  if p_expense_date is null then
    raise exception 'Expense date is required.' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_description,'')), '') is null then
    raise exception 'Expense description is required.' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Expense amount must be greater than zero.' using errcode = '22023';
  end if;

  select * into v_category
  from public.finance_categories c
  where c.id = p_finance_category_id
    and c.category_type = 'expense'
    and c.is_active;

  if v_category.id is null then
    raise exception 'Active Finance expense category is required.' using errcode = '23514';
  end if;

  select count(*), coalesce(sum(l.allocated_amount),0)::numeric(18,4)
  into v_link_count, v_allocated
  from public.finance_transaction_links l
  where l.transaction_id = v_transaction_id;

  if v_link_count > 1 and v_allocated is distinct from p_amount then
    raise exception 'Adjust company expense allocations before changing the expense amount.' using errcode = '23514';
  end if;

  v_notes := btrim(p_description)
    || case when nullif(btrim(coalesce(p_notes,'')), '') is null
            then ''
            else E'\n' || btrim(p_notes)
       end;

  perform set_config('modulex.company_expense_transaction_mutation', p_expense_id::text, true);
  perform private.update_finance_transaction_draft(
    v_transaction_id,
    'expense',
    p_source_account_id,
    null,
    p_finance_category_id,
    p_amount,
    upper(btrim(coalesce(p_currency_code,''))),
    private.company_expense_transaction_at(p_expense_date),
    nullif(btrim(coalesce(p_reference_no,'')), ''),
    v_notes
  );

  if v_link_count <= 1 then
    perform private.set_finance_transaction_links(
      v_transaction_id,
      jsonb_build_array(
        jsonb_build_object(
          'source_document_type', 'company_expense',
          'source_document_id', p_expense_id,
          'allocated_amount', p_amount,
          'notes', 'Canonical company expense source'
        )
      )
    );
  end if;
  perform set_config('modulex.company_expense_transaction_mutation', '', true);

  update public.company_expenses
  set expense_date = p_expense_date,
      finance_category_id = v_category.id,
      category = v_category.name,
      vendor = nullif(btrim(coalesce(p_vendor,'')), ''),
      description = btrim(p_description),
      amount = p_amount,
      currency_code = upper(btrim(coalesce(p_currency_code,''))),
      reference_no = nullif(btrim(coalesce(p_reference_no,'')), ''),
      notes = nullif(btrim(coalesce(p_notes,'')), ''),
      updated_by = auth.uid(),
      updated_at = now()
  where id = p_expense_id;

  return p_expense_id;
end;
$function$;

create or replace function private.delete_company_expense_draft(p_expense_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_expense public.company_expenses%rowtype;
  v_transaction_id uuid;
begin
  perform private.finance_assert_manage();

  v_transaction_id := private.get_company_expense_finance_transaction(p_expense_id);
  if v_transaction_id is null then
    raise exception 'Company expense Finance draft is missing.' using errcode = '23514';
  end if;

  perform 1
  from public.finance_transactions t
  where t.id = v_transaction_id and t.status = 'draft'
  for update;

  if not found then
    raise exception 'Deletable company expense Finance draft not found.' using errcode = '23514';
  end if;

  select * into v_expense
  from public.company_expenses e
  where e.id = p_expense_id and e.status = 'draft'
  for update;

  if v_expense.id is null then
    raise exception 'Deletable company expense draft not found.' using errcode = '23514';
  end if;

  perform set_config('modulex.company_expense_transaction_mutation', p_expense_id::text, true);
  perform private.delete_finance_transaction_draft(v_transaction_id);
  perform set_config('modulex.company_expense_transaction_mutation', '', true);

  perform set_config('modulex.company_expense_draft_delete', p_expense_id::text, true);
  delete from public.company_expenses where id = p_expense_id and status = 'draft';
  perform set_config('modulex.company_expense_draft_delete', '', true);

  return p_expense_id;
end;
$function$;

create or replace function private.post_company_expense(
  p_expense_id uuid,
  p_manual_fx_rate numeric default null,
  p_manual_fx_rate_source text default null,
  p_idempotency_key uuid default gen_random_uuid()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_expense public.company_expenses%rowtype;
  v_transaction_id uuid;
begin
  perform private.finance_assert_manage();

  v_transaction_id := private.get_company_expense_finance_transaction(p_expense_id);
  if v_transaction_id is null then
    raise exception 'Company expense Finance draft is missing.' using errcode = '23514';
  end if;

  select * into v_expense
  from public.company_expenses e
  where e.id = p_expense_id;

  if v_expense.id is null then
    raise exception 'Company expense not found.' using errcode = '23503';
  end if;
  if v_expense.status = 'posted' then
    return v_transaction_id;
  end if;
  if v_expense.status <> 'draft' then
    raise exception 'Only a company expense draft can be posted.' using errcode = '23514';
  end if;

  return private.post_finance_transaction(
    v_transaction_id,
    p_manual_fx_rate,
    p_manual_fx_rate_source,
    p_idempotency_key
  );
end;
$function$;

create or replace function private.void_company_expense(
  p_expense_id uuid,
  p_reason text,
  p_idempotency_key uuid default gen_random_uuid()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_expense public.company_expenses%rowtype;
  v_transaction_id uuid;
begin
  perform private.finance_assert_manage();

  if nullif(btrim(coalesce(p_reason,'')), '') is null then
    raise exception 'Company expense void reason is required.' using errcode = '22023';
  end if;

  v_transaction_id := private.get_company_expense_finance_transaction(p_expense_id);
  if v_transaction_id is null then
    raise exception 'Company expense Finance transaction is missing.' using errcode = '23514';
  end if;

  select * into v_expense
  from public.company_expenses e
  where e.id = p_expense_id;

  if v_expense.id is null then
    raise exception 'Company expense not found.' using errcode = '23503';
  end if;
  if v_expense.status = 'void' then
    return v_transaction_id;
  end if;
  if v_expense.status <> 'posted' then
    raise exception 'Only a posted company expense can be voided.' using errcode = '23514';
  end if;

  return private.void_finance_transaction(v_transaction_id, p_reason, p_idempotency_key);
end;
$function$;

-- Public authenticated wrappers. Browser code never writes company_expenses directly.
create or replace function public.get_company_expenses_page(
  p_limit integer default 50,
  p_offset integer default 0,
  p_status text default null,
  p_category_id uuid default null,
  p_search text default null,
  p_from date default null,
  p_to date default null
)
returns table(
  id uuid,
  expense_date date,
  finance_category_id uuid,
  category_name text,
  category_snapshot text,
  vendor text,
  description text,
  amount numeric,
  currency_code varchar,
  reference_no text,
  notes text,
  status text,
  finance_transaction_id uuid,
  finance_transaction_status text,
  source_account_id uuid,
  source_account_name text,
  base_currency_code varchar,
  base_amount numeric,
  created_at timestamptz,
  updated_at timestamptz,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $function$
  select * from private.get_company_expenses_page($1,$2,$3,$4,$5,$6,$7);
$function$;

create or replace function public.create_company_expense_draft(
  p_expense_date date,
  p_finance_category_id uuid,
  p_vendor text,
  p_description text,
  p_amount numeric,
  p_currency_code text,
  p_source_account_id uuid,
  p_reference_no text,
  p_notes text,
  p_idempotency_key uuid
)
returns uuid
language sql
security definer
set search_path = ''
as $function$
  select private.create_company_expense_draft($1,$2,$3,$4,$5,$6,$7,$8,$9,$10);
$function$;

create or replace function public.update_company_expense_draft(
  p_expense_id uuid,
  p_expense_date date,
  p_finance_category_id uuid,
  p_vendor text,
  p_description text,
  p_amount numeric,
  p_currency_code text,
  p_source_account_id uuid,
  p_reference_no text,
  p_notes text
)
returns uuid
language sql
security definer
set search_path = ''
as $function$
  select private.update_company_expense_draft($1,$2,$3,$4,$5,$6,$7,$8,$9,$10);
$function$;

create or replace function public.delete_company_expense_draft(p_expense_id uuid)
returns uuid
language sql
security definer
set search_path = ''
as $function$
  select private.delete_company_expense_draft($1);
$function$;

create or replace function public.post_company_expense(
  p_expense_id uuid,
  p_manual_fx_rate numeric default null,
  p_manual_fx_rate_source text default null,
  p_idempotency_key uuid default gen_random_uuid()
)
returns uuid
language sql
security definer
set search_path = ''
as $function$
  select private.post_company_expense($1,$2,$3,$4);
$function$;

create or replace function public.void_company_expense(
  p_expense_id uuid,
  p_reason text,
  p_idempotency_key uuid default gen_random_uuid()
)
returns uuid
language sql
security definer
set search_path = ''
as $function$
  select private.void_company_expense($1,$2,$3);
$function$;

-- Preserve the existing Executive reporting contract: company_expenses remains the
-- source-document projection, and only Finance-synchronized status='posted' rows count.
create or replace function private.get_executive_report(p_from date default null, p_to date default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_from date := coalesce(p_from, date_trunc('month', current_date)::date);
  v_to date := coalesce(p_to, current_date);
  v_sales numeric := 0;
  v_cogs numeric := 0;
  v_profit numeric := 0;
  v_margin numeric := null;
  v_orders bigint := 0;
  v_completed bigint := 0;
  v_invoiced numeric := 0;
  v_collected numeric := 0;
  v_period_outstanding numeric := 0;
  v_current_receivables numeric := 0;
  v_overdue numeric := 0;
  v_expenses numeric := 0;
  v_on_hand numeric := 0;
  v_reserved numeric := 0;
  v_available numeric := 0;
  v_inventory_value numeric := 0;
  v_available_value numeric := 0;
  v_low_stock bigint := 0;
  v_missing_cost_products bigint := 0;
  v_missing_cost_lines bigint := 0;
  v_credit_holds bigint := 0;
  v_pending_approvals bigint := 0;
  v_open_shipments bigint := 0;
  v_open_installations bigint := 0;
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_active = true and p.role in ('super_admin','admin')
  ) then
    raise exception 'Executive reports require Admin or Super Admin role.';
  end if;

  if v_to < v_from then
    raise exception 'End date cannot be before start date.';
  end if;

  select count(*), coalesce(sum(net_sales), 0), coalesce(sum(estimated_cogs), 0),
    coalesce(sum(estimated_gross_profit), 0), count(*) filter (where status = 'completed'),
    coalesce(sum(missing_cost_lines), 0)
  into v_orders, v_sales, v_cogs, v_profit, v_completed, v_missing_cost_lines
  from public.v_order_profitability_current_cost
  where order_date between v_from and v_to and status not in ('draft','cancelled');

  if v_sales > 0 then v_margin := round((v_profit / v_sales) * 100, 2); end if;

  select coalesce(sum(total_amount), 0), coalesce(sum(paid_amount), 0),
    coalesce(sum(greatest(total_amount - paid_amount, 0)), 0)
  into v_invoiced, v_collected, v_period_outstanding
  from public.customer_invoices
  where invoice_date between v_from and v_to and status not in ('draft','void');

  select coalesce(sum(greatest(total_amount - paid_amount, 0)), 0),
    coalesce(sum(case when (status = 'overdue' or (due_date < current_date and status not in ('paid','void','draft'))) then greatest(total_amount - paid_amount, 0) else 0 end), 0)
  into v_current_receivables, v_overdue
  from public.customer_invoices
  where status not in ('void','draft','paid');

  select coalesce(sum(amount), 0) into v_expenses
  from public.company_expenses
  where expense_date between v_from and v_to and status = 'posted';

  select coalesce(sum(on_hand_quantity), 0), coalesce(sum(reserved_quantity), 0),
    coalesce(sum(available_quantity), 0), coalesce(sum(on_hand_cost_value), 0),
    coalesce(sum(available_cost_value), 0), count(*) filter (where missing_current_cost)
  into v_on_hand, v_reserved, v_available, v_inventory_value, v_available_value, v_missing_cost_products
  from public.v_inventory_cost_valuation;

  select count(*) into v_low_stock from public.v_low_stock_products;
  select count(*) into v_credit_holds from public.customer_commercial_settings where credit_hold = true;

  if to_regclass('public.approval_requests') is not null then
    execute 'select count(*) from public.approval_requests where status = $1'
      into v_pending_approvals using 'pending';
  end if;

  select count(*) into v_open_shipments from public.customer_shipments where status not in ('delivered','cancelled');
  select count(*) into v_open_installations from public.customer_installations where status not in ('completed','cancelled');

  return jsonb_build_object(
    'period', jsonb_build_object('from', v_from, 'to', v_to),
    'sales', jsonb_build_object('orders', v_orders, 'completed_orders', v_completed, 'net_sales', v_sales,
      'estimated_cogs', v_cogs, 'estimated_gross_profit', v_profit, 'estimated_margin_percent', v_margin,
      'missing_cost_lines', v_missing_cost_lines),
    'finance', jsonb_build_object('invoiced', v_invoiced, 'recorded_collections', v_collected,
      'period_outstanding', v_period_outstanding, 'current_receivables', v_current_receivables,
      'overdue_receivables', v_overdue, 'expenses', v_expenses, 'recorded_cash_position', v_collected - v_expenses),
    'inventory', jsonb_build_object('on_hand_quantity', v_on_hand, 'reserved_quantity', v_reserved,
      'available_quantity', v_available, 'on_hand_cost_value', v_inventory_value, 'available_cost_value', v_available_value,
      'low_stock_products', v_low_stock, 'missing_cost_products', v_missing_cost_products),
    'risk', jsonb_build_object('credit_holds', v_credit_holds, 'pending_approvals', v_pending_approvals,
      'open_shipments', v_open_shipments, 'open_installations', v_open_installations)
  );
end;
$function$;

create or replace function private.get_executive_monthly_trend(p_months integer default 12)
returns table(month date, net_sales numeric, invoiced numeric, recorded_collections numeric, expenses numeric)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_active = true and p.role in ('super_admin','admin')
  ) then
    raise exception 'Executive reports require Admin or Super Admin role.';
  end if;

  return query
  with months as (
    select generate_series(
      date_trunc('month', current_date) - ((greatest(1, least(coalesce(p_months,12),24)) - 1) || ' months')::interval,
      date_trunc('month', current_date),
      interval '1 month'
    )::date as month
  ), sales as (
    select date_trunc('month', order_date)::date as month, coalesce(sum(net_sales),0) as amount
    from public.v_order_profitability_current_cost
    where status not in ('draft','cancelled')
    group by 1
  ), invoices as (
    select date_trunc('month', invoice_date)::date as month,
      coalesce(sum(total_amount) filter (where status not in ('draft','void')),0) as invoiced,
      coalesce(sum(paid_amount) filter (where status not in ('draft','void')),0) as collected
    from public.customer_invoices
    group by 1
  ), expenses as (
    select date_trunc('month', expense_date)::date as month, coalesce(sum(amount),0) as amount
    from public.company_expenses
    where status='posted'
    group by 1
  )
  select m.month,
    coalesce(s.amount,0)::numeric,
    coalesce(i.invoiced,0)::numeric,
    coalesce(i.collected,0)::numeric,
    coalesce(e.amount,0)::numeric
  from months m
  left join sales s using(month)
  left join invoices i using(month)
  left join expenses e using(month)
  order by m.month;
end;
$function$;

-- Close the old browser direct-write path. RLS SELECT remains for compatibility reads,
-- while every Finance-sensitive mutation now goes through guarded RPC/private cores.
drop policy if exists company_expenses_insert_admin on public.company_expenses;
drop policy if exists company_expenses_update_admin on public.company_expenses;
drop policy if exists company_expenses_delete_super_admin on public.company_expenses;

revoke insert, update, delete, truncate on public.company_expenses from anon, authenticated;
grant select on public.company_expenses to authenticated;

revoke all on function private.company_expense_transaction_at(date) from public, anon, authenticated, service_role;
revoke all on function private.get_company_expense_finance_transaction(uuid) from public, anon, authenticated, service_role;
revoke all on function private.guard_company_expense_history() from public, anon, authenticated, service_role;
revoke all on function private.guard_company_expense_finance_transaction() from public, anon, authenticated, service_role;
revoke all on function private.guard_company_expense_finance_link() from public, anon, authenticated, service_role;
revoke all on function private.validate_company_expense_finance_posting() from public, anon, authenticated, service_role;
revoke all on function private.reconcile_company_expense_finance_after_change() from public, anon, authenticated, service_role;
revoke all on function private.get_company_expenses_page(integer,integer,text,uuid,text,date,date) from public, anon, authenticated, service_role;
revoke all on function private.create_company_expense_draft(date,uuid,text,text,numeric,text,uuid,text,text,uuid) from public, anon, authenticated, service_role;
revoke all on function private.update_company_expense_draft(uuid,date,uuid,text,text,numeric,text,uuid,text,text) from public, anon, authenticated, service_role;
revoke all on function private.delete_company_expense_draft(uuid) from public, anon, authenticated, service_role;
revoke all on function private.post_company_expense(uuid,numeric,text,uuid) from public, anon, authenticated, service_role;
revoke all on function private.void_company_expense(uuid,text,uuid) from public, anon, authenticated, service_role;

revoke execute on function public.get_company_expenses_page(integer,integer,text,uuid,text,date,date) from public, anon;
revoke execute on function public.create_company_expense_draft(date,uuid,text,text,numeric,text,uuid,text,text,uuid) from public, anon;
revoke execute on function public.update_company_expense_draft(uuid,date,uuid,text,text,numeric,text,uuid,text,text) from public, anon;
revoke execute on function public.delete_company_expense_draft(uuid) from public, anon;
revoke execute on function public.post_company_expense(uuid,numeric,text,uuid) from public, anon;
revoke execute on function public.void_company_expense(uuid,text,uuid) from public, anon;

grant execute on function public.get_company_expenses_page(integer,integer,text,uuid,text,date,date) to authenticated, service_role;
grant execute on function public.create_company_expense_draft(date,uuid,text,text,numeric,text,uuid,text,text,uuid) to authenticated, service_role;
grant execute on function public.update_company_expense_draft(uuid,date,uuid,text,text,numeric,text,uuid,text,text) to authenticated, service_role;
grant execute on function public.delete_company_expense_draft(uuid) to authenticated, service_role;
grant execute on function public.post_company_expense(uuid,numeric,text,uuid) to authenticated, service_role;
grant execute on function public.void_company_expense(uuid,text,uuid) to authenticated, service_role;
