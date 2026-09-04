-- A6 Finance/HR integration: one canonical Finance employee payment projected into Personnel/Payroll.
-- HR owns payroll calculation; Finance owns actual money movement.

create or replace function private.validate_finance_employee_payment_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_payroll_employee uuid;
begin
  if new.employee_id is not null then
    perform 1 from public.hr_employees e where e.id = new.employee_id;
    if not found then
      raise exception 'Finance attribution Employee not found.' using errcode = '23503';
    end if;
  end if;

  if new.source_document_type = 'hr_payroll_item' then
    if new.employee_id is null then
      raise exception 'Finance Payroll Item attribution requires an Employee.' using errcode = '23514';
    end if;

    select i.employee_id
    into v_payroll_employee
    from public.hr_payroll_items i
    where i.id = new.source_document_id;

    if not found then
      raise exception 'Finance attribution Payroll Item not found.' using errcode = '23503';
    end if;

    if new.employee_id is distinct from v_payroll_employee then
      raise exception 'Finance Payroll Item attribution must match the Employee.' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_validate_finance_employee_payment_link on public.finance_transaction_links;
create trigger trg_validate_finance_employee_payment_link
before insert or update on public.finance_transaction_links
for each row execute function private.validate_finance_employee_payment_link();

create or replace function private.validate_finance_employee_payment_posting()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_transaction public.finance_transactions%rowtype;
  v_employee_count integer := 0;
  v_unowned_link_count integer := 0;
  v_allocated_total numeric(18,4) := 0;
  v_payroll_link record;
  v_payroll_net numeric(18,4);
  v_existing_paid numeric(18,4);
  v_base_currency varchar(3);
begin
  if tg_op <> 'UPDATE'
     or old.status is not distinct from 'draft'
     or new.status is not distinct from 'posted'
     or new.transaction_kind <> 'employee_payment' then
    return new;
  end if;

  select * into v_transaction
  from public.finance_transactions
  where id = new.id;

  select
    count(distinct l.employee_id),
    count(*) filter (where l.employee_id is null),
    coalesce(sum(l.allocated_amount),0)::numeric(18,4)
  into v_employee_count, v_unowned_link_count, v_allocated_total
  from public.finance_transaction_links l
  where l.transaction_id = new.id;

  if v_employee_count <> 1 or v_unowned_link_count <> 0 then
    raise exception 'Employee payment requires exactly one Employee attribution on every allocation row.' using errcode = '23514';
  end if;

  if v_allocated_total is distinct from v_transaction.amount then
    raise exception 'Employee payment allocation must equal the Finance transaction amount.' using errcode = '23514';
  end if;

  v_base_currency := private.finance_base_currency();

  for v_payroll_link in
    select l.source_document_id, l.allocated_amount
    from public.finance_transaction_links l
    where l.transaction_id = new.id
      and l.source_document_type = 'hr_payroll_item'
  loop
    if new.currency_code is distinct from v_base_currency then
      raise exception 'Payroll Item linked Finance payments must use the company base currency.' using errcode = '23514';
    end if;

    select i.net_pay::numeric(18,4)
    into v_payroll_net
    from public.hr_payroll_items i
    join public.hr_payroll_runs r on r.id = i.payroll_run_id
    where i.id = v_payroll_link.source_document_id
      and r.status = 'approved';

    if not found then
      raise exception 'Payroll Item must belong to an approved payroll run before Finance payment.' using errcode = '23514';
    end if;

    select greatest(coalesce(sum(
      case when t.transaction_kind = 'reversal' then -l.allocated_amount else l.allocated_amount end
    ),0),0)::numeric(18,4)
    into v_existing_paid
    from public.finance_transaction_links l
    join public.finance_transactions t on t.id = l.transaction_id
    where l.source_document_type = 'hr_payroll_item'
      and l.source_document_id = v_payroll_link.source_document_id
      and t.status = 'posted'
      and t.id <> new.id
      and t.transaction_kind in ('employee_payment','reversal');

    if v_existing_paid + v_payroll_link.allocated_amount > v_payroll_net then
      raise exception 'Finance payment would exceed the Payroll Item net pay.' using errcode = '23514';
    end if;
  end loop;

  return new;
end;
$function$;

drop trigger if exists trg_validate_finance_employee_payment_posting on public.finance_transactions;
create trigger trg_validate_finance_employee_payment_posting
before update of status on public.finance_transactions
for each row execute function private.validate_finance_employee_payment_posting();

create or replace function private.finance_employee_payment_assert_projection_view()
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null
     or not private.current_user_has_any_role(array['super_admin','admin','finance','hr']::text[]) then
    raise exception 'Finance/Personnel payment view permission is required.' using errcode = '42501';
  end if;
end;
$function$;

create or replace function public.get_finance_employee_directory()
returns table (
  employee_id uuid,
  employee_number text,
  full_name text,
  employment_status text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  perform private.finance_assert_manage();
  return query
  select e.id, e.employee_number,
         concat_ws(' ', e.first_name, e.last_name)::text,
         e.employment_status
  from public.hr_employees e
  order by (e.employment_status = 'active') desc, e.first_name, e.last_name, e.employee_number;
end;
$function$;

create or replace function public.get_finance_employee_payroll_items(p_employee_id uuid)
returns table (
  payroll_item_id uuid,
  payroll_run_id uuid,
  period_code text,
  pay_date date,
  run_status text,
  net_pay numeric,
  paid_amount numeric,
  remaining_amount numeric,
  payment_status text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  perform private.finance_assert_manage();
  return query
  with paid as (
    select l.source_document_id as payroll_item_id,
           greatest(coalesce(sum(case when t.transaction_kind = 'reversal' then -l.allocated_amount else l.allocated_amount end),0),0)::numeric(18,4) as paid_amount
    from public.finance_transaction_links l
    join public.finance_transactions t on t.id = l.transaction_id
    where l.source_document_type = 'hr_payroll_item'
      and t.status = 'posted'
      and t.transaction_kind in ('employee_payment','reversal')
    group by l.source_document_id
  )
  select i.id, i.payroll_run_id, p.period_code, p.pay_date, r.status,
         i.net_pay,
         coalesce(pd.paid_amount,0)::numeric(18,4),
         greatest(i.net_pay - coalesce(pd.paid_amount,0),0)::numeric(18,4),
         case
           when coalesce(pd.paid_amount,0) <= 0 then 'unpaid'
           when coalesce(pd.paid_amount,0) < i.net_pay then 'partial'
           else 'paid'
         end::text
  from public.hr_payroll_items i
  join public.hr_payroll_runs r on r.id = i.payroll_run_id
  join public.hr_payroll_periods p on p.id = r.payroll_period_id
  left join paid pd on pd.payroll_item_id = i.id
  where i.employee_id = p_employee_id
    and r.status = 'approved'
    and greatest(i.net_pay - coalesce(pd.paid_amount,0),0) > 0
  order by p.pay_date, p.period_start, r.run_number, i.id;
end;
$function$;

create or replace function public.get_hr_payroll_finance_settlement(p_run_id uuid)
returns table (
  payroll_item_id uuid,
  paid_amount numeric,
  remaining_amount numeric,
  payment_status text,
  latest_payment_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  perform private.finance_employee_payment_assert_projection_view();
  return query
  with signed_payments as (
    select l.source_document_id as payroll_item_id,
           greatest(coalesce(sum(case when t.transaction_kind = 'reversal' then -l.allocated_amount else l.allocated_amount end),0),0)::numeric(18,4) as paid_amount,
           max(t.posted_at) as latest_payment_at
    from public.finance_transaction_links l
    join public.finance_transactions t on t.id = l.transaction_id
    where l.source_document_type = 'hr_payroll_item'
      and t.status = 'posted'
      and t.transaction_kind in ('employee_payment','reversal')
    group by l.source_document_id
  )
  select i.id,
         coalesce(sp.paid_amount,0)::numeric(18,4),
         greatest(i.net_pay - coalesce(sp.paid_amount,0),0)::numeric(18,4),
         case
           when coalesce(sp.paid_amount,0) <= 0 then 'unpaid'
           when coalesce(sp.paid_amount,0) < i.net_pay then 'partial'
           else 'paid'
         end::text,
         sp.latest_payment_at
  from public.hr_payroll_items i
  left join signed_payments sp on sp.payroll_item_id = i.id
  where i.payroll_run_id = p_run_id
  order by i.employee_id, i.id;
end;
$function$;

create or replace function public.get_hr_employee_finance_payments(p_employee_id uuid)
returns table (
  transaction_id uuid,
  transaction_kind text,
  transaction_at timestamptz,
  posted_at timestamptz,
  amount numeric,
  currency_code varchar(3),
  reference_no text,
  source_account_name text,
  payroll_item_id uuid,
  period_code text,
  payment_status text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  perform private.finance_employee_payment_assert_projection_view();
  return query
  select t.id, t.transaction_kind, t.transaction_at, t.posted_at,
         (case when t.transaction_kind = 'reversal' then -l.allocated_amount else l.allocated_amount end)::numeric(18,4),
         t.currency_code, t.reference_no, a.name,
         case when l.source_document_type = 'hr_payroll_item' then l.source_document_id else null end,
         p.period_code,
         case when t.transaction_kind = 'reversal' then 'reversed' else 'posted' end::text
  from public.finance_transaction_links l
  join public.finance_transactions t on t.id = l.transaction_id
  left join public.finance_accounts a on a.id = t.source_account_id
  left join public.hr_payroll_items i on l.source_document_type = 'hr_payroll_item' and i.id = l.source_document_id
  left join public.hr_payroll_runs r on r.id = i.payroll_run_id
  left join public.hr_payroll_periods p on p.id = r.payroll_period_id
  where l.employee_id = p_employee_id
    and t.status = 'posted'
    and t.transaction_kind in ('employee_payment','reversal')
  order by t.transaction_at desc, t.posted_at desc, t.id desc;
end;
$function$;

revoke all on function private.validate_finance_employee_payment_link() from public,anon,authenticated;
revoke all on function private.validate_finance_employee_payment_posting() from public,anon,authenticated;
revoke all on function private.finance_employee_payment_assert_projection_view() from public,anon,authenticated;

revoke all on function public.get_finance_employee_directory() from public,anon;
revoke all on function public.get_finance_employee_payroll_items(uuid) from public,anon;
revoke all on function public.get_hr_payroll_finance_settlement(uuid) from public,anon;
revoke all on function public.get_hr_employee_finance_payments(uuid) from public,anon;

grant execute on function public.get_finance_employee_directory() to authenticated;
grant execute on function public.get_finance_employee_payroll_items(uuid) to authenticated;
grant execute on function public.get_hr_payroll_finance_settlement(uuid) to authenticated;
grant execute on function public.get_hr_employee_finance_payments(uuid) to authenticated;

notify pgrst, 'reload schema';
