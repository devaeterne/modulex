-- A6-F1 hardening: guarded draft delete, historical inactive dimensions, executable RPC wrappers,
-- and DB-authoritative attribution/allocation reconciliation.
-- This migration intentionally does not widen authenticated access to private Finance cores.

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
  v_allow_inactive_history boolean := false;
  v_allocated_total numeric(18,4) := 0;
begin
  new.currency_code := upper(btrim(new.currency_code));
  new.reference_no := nullif(btrim(coalesce(new.reference_no,'')), '');
  new.notes := nullif(btrim(coalesce(new.notes,'')), '');

  v_allow_inactive_history := new.transaction_kind = 'reversal';
  if tg_op = 'UPDATE' and old.status = 'posted' and new.status = 'voided' then
    v_allow_inactive_history := true;
  end if;

  if new.source_account_id is not null then
    select * into v_source from public.finance_accounts where id = new.source_account_id;
    if v_source.id is null then
      raise exception 'Source Finance account is missing.' using errcode = '23514';
    end if;
    if not v_source.is_active and not v_allow_inactive_history then
      raise exception 'Source Finance account is inactive.' using errcode = '23514';
    end if;
    if v_source.currency_code is distinct from new.currency_code then
      raise exception 'Source Finance account currency must match transaction currency.' using errcode = '23514';
    end if;
  end if;

  if new.destination_account_id is not null then
    select * into v_destination from public.finance_accounts where id = new.destination_account_id;
    if v_destination.id is null then
      raise exception 'Destination Finance account is missing.' using errcode = '23514';
    end if;
    if not v_destination.is_active and not v_allow_inactive_history then
      raise exception 'Destination Finance account is inactive.' using errcode = '23514';
    end if;
    if v_destination.currency_code is distinct from new.currency_code then
      raise exception 'Destination Finance account currency must match transaction currency.' using errcode = '23514';
    end if;
  end if;

  if new.category_id is not null then
    select * into v_category from public.finance_categories where id = new.category_id;
    if v_category.id is null then
      raise exception 'Finance category is missing.' using errcode = '23514';
    end if;
    if not v_category.is_active and not v_allow_inactive_history then
      raise exception 'Finance category is inactive.' using errcode = '23514';
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

  select coalesce(sum(l.allocated_amount),0)::numeric(18,4)
  into v_allocated_total
  from public.finance_transaction_links l
  where l.transaction_id = new.id;

  if v_allocated_total > new.amount then
    raise exception 'Finance transaction amount cannot be lower than its allocated total.' using errcode = '23514';
  end if;

  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$function$;

create or replace function private.validate_finance_transaction_link_context()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_transaction public.finance_transactions%rowtype;
  v_order_project uuid;
  v_order_customer uuid;
  v_project_customer uuid;
  v_other_allocated numeric(18,4) := 0;
begin
  select * into v_transaction
  from public.finance_transactions
  where id = new.transaction_id;

  if v_transaction.id is null then
    raise exception 'Finance transaction not found.' using errcode = '23503';
  end if;

  if new.order_id is not null then
    select o.project_id, o.customer_id
    into v_order_project, v_order_customer
    from public.customer_orders o
    where o.id = new.order_id;

    if not found then
      raise exception 'Finance attribution Order not found.' using errcode = '23503';
    end if;
    if new.project_id is not null and v_order_project is distinct from new.project_id then
      raise exception 'Finance Order/Project attribution does not match.' using errcode = '23514';
    end if;
    if new.customer_id is not null and v_order_customer is distinct from new.customer_id then
      raise exception 'Finance Order/Customer attribution does not match.' using errcode = '23514';
    end if;
  end if;

  if new.project_id is not null then
    select p.customer_id
    into v_project_customer
    from public.customer_projects p
    where p.id = new.project_id;

    if not found then
      raise exception 'Finance attribution Project not found.' using errcode = '23503';
    end if;
    if new.customer_id is not null and v_project_customer is distinct from new.customer_id then
      raise exception 'Finance Project/Customer attribution does not match.' using errcode = '23514';
    end if;
  end if;

  select coalesce(sum(l.allocated_amount),0)::numeric(18,4)
  into v_other_allocated
  from public.finance_transaction_links l
  where l.transaction_id = new.transaction_id
    and l.id is distinct from new.id;

  if v_other_allocated + new.allocated_amount > v_transaction.amount then
    raise exception 'Finance allocated_amount total cannot exceed transaction amount.' using errcode = '23514';
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_validate_finance_transaction_link_context on public.finance_transaction_links;
create trigger trg_validate_finance_transaction_link_context
before insert or update on public.finance_transaction_links
for each row execute function private.validate_finance_transaction_link_context();

create or replace function private.guard_finance_append_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_draft_delete text := current_setting('modulex.finance_draft_delete', true);
begin
  if tg_op = 'DELETE' and nullif(v_draft_delete, '') is not null then
    if tg_table_schema = 'public'
       and tg_table_name = 'finance_transaction_audit'
       and old.transaction_id::text = v_draft_delete then
      return old;
    end if;
    if tg_table_schema = 'public'
       and tg_table_name = 'finance_idempotency_requests'
       and old.result_transaction_id::text = v_draft_delete then
      return old;
    end if;
  end if;

  raise exception 'Finance audit/idempotency history is append-only.' using errcode = '23514';
end;
$function$;

create or replace function private.delete_finance_transaction_draft(
  p_transaction_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_transaction public.finance_transactions%rowtype;
begin
  perform private.finance_assert_manage();

  select * into v_transaction
  from public.finance_transactions
  where id=p_transaction_id and status='draft' for update;

  if v_transaction.id is null then
    raise exception 'Deletable Finance draft not found.' using errcode = '23514';
  end if;

  perform set_config('modulex.finance_draft_delete', p_transaction_id::text, true);

  delete from public.finance_transaction_links where transaction_id=p_transaction_id;
  delete from public.finance_transaction_audit where transaction_id=p_transaction_id;
  delete from public.finance_idempotency_requests where result_transaction_id=p_transaction_id;
  delete from public.finance_transactions where id=p_transaction_id and status='draft';

  perform set_config('modulex.finance_draft_delete', '', true);
  return p_transaction_id;
end;
$function$;

-- Public mutation wrappers execute as the migration owner so they can reach the private cores.
-- Every private core still performs the canonical auth.uid()/role assertion; authenticated never receives private EXECUTE.
create or replace function public.create_finance_account(
  p_code text,
  p_name text,
  p_account_type text,
  p_currency_code text,
  p_institution_name text default null,
  p_reference_no text default null
)
returns uuid
language sql
security definer
set search_path = ''
as $function$
  select private.create_finance_account($1,$2,$3,$4,$5,$6);
$function$;

create or replace function public.update_finance_account(
  p_account_id uuid,
  p_name text,
  p_institution_name text default null,
  p_reference_no text default null,
  p_is_active boolean default true
)
returns uuid
language sql
security definer
set search_path = ''
as $function$
  select private.update_finance_account($1,$2,$3,$4,$5);
$function$;

create or replace function public.create_finance_category(
  p_code text,
  p_name text,
  p_category_type text
)
returns uuid
language sql
security definer
set search_path = ''
as $function$
  select private.create_finance_category($1,$2,$3);
$function$;

create or replace function public.upsert_finance_fx_rate(
  p_from_currency text,
  p_to_currency text,
  p_rate numeric,
  p_rate_source text,
  p_observed_at timestamptz
)
returns uuid
language sql
security definer
set search_path = ''
as $function$
  select private.upsert_finance_fx_rate($1,$2,$3,$4,$5);
$function$;

create or replace function public.create_finance_transaction_draft(
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
language sql
security definer
set search_path = ''
as $function$
  select private.create_finance_transaction_draft($1,$2,$3,$4,$5,$6,$7,$8,$9,$10);
$function$;

create or replace function public.update_finance_transaction_draft(
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
language sql
security definer
set search_path = ''
as $function$
  select private.update_finance_transaction_draft($1,$2,$3,$4,$5,$6,$7,$8,$9,$10);
$function$;

create or replace function public.set_finance_transaction_links(
  p_transaction_id uuid,
  p_links jsonb
)
returns integer
language sql
security definer
set search_path = ''
as $function$
  select private.set_finance_transaction_links($1,$2);
$function$;

create or replace function public.post_finance_transaction(
  p_transaction_id uuid,
  p_manual_fx_rate numeric default null,
  p_manual_fx_rate_source text default null,
  p_idempotency_key uuid default null
)
returns uuid
language sql
security definer
set search_path = ''
as $function$
  select private.post_finance_transaction($1,$2,$3,$4);
$function$;

create or replace function public.void_finance_transaction(
  p_transaction_id uuid,
  p_reason text,
  p_idempotency_key uuid
)
returns uuid
language sql
security definer
set search_path = ''
as $function$
  select private.void_finance_transaction($1,$2,$3);
$function$;

create or replace function public.reverse_finance_transaction(
  p_transaction_id uuid,
  p_reason text,
  p_idempotency_key uuid
)
returns uuid
language sql
security definer
set search_path = ''
as $function$
  select private.reverse_finance_transaction($1,$2,$3);
$function$;

create or replace function public.delete_finance_transaction_draft(
  p_transaction_id uuid
)
returns uuid
language sql
security definer
set search_path = ''
as $function$
  select private.delete_finance_transaction_draft($1);
$function$;

revoke all on function private.delete_finance_transaction_draft(uuid) from public,anon,authenticated;
revoke all on function private.validate_finance_transaction_shape() from public,anon,authenticated;
revoke all on function private.validate_finance_transaction_link_context() from public,anon,authenticated;
revoke all on function private.guard_finance_append_only() from public,anon,authenticated;

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
revoke all on function public.delete_finance_transaction_draft(uuid) from public,anon;

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
grant execute on function public.delete_finance_transaction_draft(uuid) to authenticated;

notify pgrst, 'reload schema';
