-- A6 F4 Payroll/Finance hardening.
-- HR owns payroll calculation/source records; Finance owns actual money movement.
-- This migration closes direct HR-source double-payment paths without creating a parallel ledger.

create or replace function private.validate_finance_employee_payment_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_transaction_kind text;
  v_source_employee uuid;
  v_source_status text;
  v_source_date date;
begin
  select t.transaction_kind
  into v_transaction_kind
  from public.finance_transactions t
  where t.id = new.transaction_id;

  if new.employee_id is not null then
    perform 1 from public.hr_employees e where e.id = new.employee_id;
    if not found then
      raise exception 'Finance attribution Employee not found.' using errcode = '23503';
    end if;
  end if;

  if v_transaction_kind = 'employee_payment'
     and new.source_document_type is not null
     and new.source_document_type not in ('hr_payroll_item','hr_variable_pay','hr_advance') then
    raise exception 'Employee payment source document type is not supported.' using errcode = '23514';
  end if;

  if new.source_document_type in ('hr_payroll_item','hr_variable_pay','hr_advance')
     and v_transaction_kind not in ('employee_payment','reversal') then
    raise exception 'Canonical HR payment sources may only be linked to Employee Payments or their reversals.' using errcode = '23514';
  end if;

  if new.source_document_type = 'hr_payroll_item' then
    if new.employee_id is null then
      raise exception 'Finance Payroll Item attribution requires an Employee.' using errcode = '23514';
    end if;

    select i.employee_id
    into v_source_employee
    from public.hr_payroll_items i
    where i.id = new.source_document_id;

    if not found then
      raise exception 'Finance attribution Payroll Item not found.' using errcode = '23503';
    end if;

    if new.employee_id is distinct from v_source_employee then
      raise exception 'Finance Payroll Item attribution must match the Employee.' using errcode = '23514';
    end if;
  elsif new.source_document_type = 'hr_variable_pay' then
    if new.employee_id is null then
      raise exception 'Finance Variable Pay attribution requires an Employee.' using errcode = '23514';
    end if;

    select v.employee_id, v.status, v.earning_date
    into v_source_employee, v_source_status, v_source_date
    from public.hr_variable_pay v
    where v.id = new.source_document_id;

    if not found then
      raise exception 'Finance attribution Variable Pay not found.' using errcode = '23503';
    end if;
    if new.employee_id is distinct from v_source_employee then
      raise exception 'Finance Variable Pay attribution must match the Employee.' using errcode = '23514';
    end if;
    if v_transaction_kind = 'employee_payment' and v_source_status <> 'approved' then
      raise exception 'Variable Pay must be approved before direct Finance payment.' using errcode = '23514';
    end if;
    if v_transaction_kind = 'employee_payment' and exists (
      select 1
      from public.hr_payroll_items i
      join public.hr_payroll_runs r on r.id = i.payroll_run_id
      join public.hr_payroll_periods p on p.id = r.payroll_period_id
      where i.employee_id = v_source_employee
        and r.status in ('calculated','approved')
        and v_source_date between p.period_start and p.period_end
    ) then
      raise exception 'Variable Pay is already included in a Payroll run; pay the Payroll Item instead.' using errcode = '23514';
    end if;
  elsif new.source_document_type = 'hr_advance' then
    if new.employee_id is null then
      raise exception 'Finance Advance attribution requires an Employee.' using errcode = '23514';
    end if;

    select a.employee_id, a.status
    into v_source_employee, v_source_status
    from public.hr_advances a
    where a.id = new.source_document_id;

    if not found then
      raise exception 'Finance attribution Advance not found.' using errcode = '23503';
    end if;
    if new.employee_id is distinct from v_source_employee then
      raise exception 'Finance Advance attribution must match the Employee.' using errcode = '23514';
    end if;
    if v_transaction_kind = 'employee_payment' and v_source_status <> 'open' then
      raise exception 'Advance must be open before direct Finance disbursement.' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$function$;

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
  v_link record;
  v_source_amount numeric(18,4);
  v_source_currency text;
  v_source_status text;
  v_existing_paid numeric(18,4);
  v_base_currency varchar(3);
begin
  if tg_op <> 'UPDATE'
     or old.status is distinct from 'draft'
     or new.status is distinct from 'posted'
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

  for v_link in
    select l.source_document_type, l.source_document_id, l.allocated_amount
    from public.finance_transaction_links l
    where l.transaction_id = new.id
  loop
    if v_link.source_document_type = 'hr_payroll_item' then
      if new.currency_code is distinct from v_base_currency then
        raise exception 'Payroll Item linked Finance payments must use the company base currency.' using errcode = '23514';
      end if;

      select i.net_pay::numeric(18,4)
      into v_source_amount
      from public.hr_payroll_items i
      join public.hr_payroll_runs r on r.id = i.payroll_run_id
      where i.id = v_link.source_document_id
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
        and l.source_document_id = v_link.source_document_id
        and t.status = 'posted'
        and t.id <> new.id
        and t.transaction_kind in ('employee_payment','reversal');

      if v_existing_paid + v_link.allocated_amount > v_source_amount then
        raise exception 'Finance payment would exceed the Payroll Item net pay.' using errcode = '23514';
      end if;
    elsif v_link.source_document_type = 'hr_variable_pay' then
      select v.amount::numeric(18,4), upper(v.currency_code), v.status
      into v_source_amount, v_source_currency, v_source_status
      from public.hr_variable_pay v
      where v.id = v_link.source_document_id;

      if not found then
        raise exception 'Finance attribution Variable Pay not found.' using errcode = '23503';
      end if;
      if v_source_status <> 'approved' then
        raise exception 'Variable Pay must be approved before direct Finance payment.' using errcode = '23514';
      end if;
      if v_source_currency is distinct from v_base_currency
         or new.currency_code is distinct from v_base_currency then
        raise exception 'Direct Variable Pay Finance payments must use the company base currency.' using errcode = '23514';
      end if;

      select greatest(coalesce(sum(
        case when t.transaction_kind = 'reversal' then -l.allocated_amount else l.allocated_amount end
      ),0),0)::numeric(18,4)
      into v_existing_paid
      from public.finance_transaction_links l
      join public.finance_transactions t on t.id = l.transaction_id
      where l.source_document_type = 'hr_variable_pay'
        and l.source_document_id = v_link.source_document_id
        and t.status = 'posted'
        and t.id <> new.id
        and t.transaction_kind in ('employee_payment','reversal');

      if v_existing_paid + v_link.allocated_amount > v_source_amount then
        raise exception 'Finance payment would exceed the Variable Pay amount.' using errcode = '23514';
      end if;
      if v_existing_paid + v_link.allocated_amount is distinct from v_source_amount then
        raise exception 'Direct Variable Pay Finance payment must settle the remaining source amount in full.' using errcode = '23514';
      end if;
    elsif v_link.source_document_type = 'hr_advance' then
      select a.amount::numeric(18,4), upper(a.currency_code), a.status
      into v_source_amount, v_source_currency, v_source_status
      from public.hr_advances a
      where a.id = v_link.source_document_id;

      if not found then
        raise exception 'Finance attribution Advance not found.' using errcode = '23503';
      end if;
      if v_source_status <> 'open' then
        raise exception 'Advance must be open before direct Finance disbursement.' using errcode = '23514';
      end if;
      if v_source_currency is distinct from v_base_currency
         or new.currency_code is distinct from v_base_currency then
        raise exception 'Direct Advance Finance payments must use the company base currency.' using errcode = '23514';
      end if;

      select greatest(coalesce(sum(
        case when t.transaction_kind = 'reversal' then -l.allocated_amount else l.allocated_amount end
      ),0),0)::numeric(18,4)
      into v_existing_paid
      from public.finance_transaction_links l
      join public.finance_transactions t on t.id = l.transaction_id
      where l.source_document_type = 'hr_advance'
        and l.source_document_id = v_link.source_document_id
        and t.status = 'posted'
        and t.id <> new.id
        and t.transaction_kind in ('employee_payment','reversal');

      if v_existing_paid + v_link.allocated_amount > v_source_amount then
        raise exception 'Finance payment would exceed the Advance amount.' using errcode = '23514';
      end if;
      if v_existing_paid + v_link.allocated_amount is distinct from v_source_amount then
        raise exception 'Direct Advance Finance payment must settle the remaining disbursement amount in full.' using errcode = '23514';
      end if;
    end if;
  end loop;

  return new;
end;
$function$;

create or replace function private.reconcile_hr_direct_finance_source(
  p_source_document_type text,
  p_source_document_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_source_amount numeric(18,4);
  v_source_status text;
  v_paid_amount numeric(18,4);
begin
  if p_source_document_type <> 'hr_variable_pay' then
    return;
  end if;

  select v.amount::numeric(18,4), v.status
  into v_source_amount, v_source_status
  from public.hr_variable_pay v
  where v.id = p_source_document_id
  for update;

  if not found then
    return;
  end if;

  select greatest(coalesce(sum(
    case when t.transaction_kind = 'reversal' then -l.allocated_amount else l.allocated_amount end
  ),0),0)::numeric(18,4)
  into v_paid_amount
  from public.finance_transaction_links l
  join public.finance_transactions t on t.id = l.transaction_id
  where l.source_document_type = 'hr_variable_pay'
    and l.source_document_id = p_source_document_id
    and t.status = 'posted'
    and t.transaction_kind in ('employee_payment','reversal');

  if v_paid_amount >= v_source_amount and v_source_status = 'approved' then
    update public.hr_variable_pay
    set status = 'paid', updated_by = auth.uid(), updated_at = now()
    where id = p_source_document_id;
  elsif v_paid_amount < v_source_amount and v_source_status = 'paid'
        and not exists (
          select 1
          from public.hr_payroll_finance_settlement_effects e
          where e.effect_type = 'variable_pay'
            and e.source_id = p_source_document_id
            and e.effect_status = 'applied'
        ) then
    update public.hr_variable_pay
    set status = 'approved', updated_by = auth.uid(), updated_at = now()
    where id = p_source_document_id;
  end if;
end;
$function$;

create or replace function private.reconcile_hr_direct_finance_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_source record;
begin
  if tg_op <> 'UPDATE' or old.status is not distinct from new.status then
    return new;
  end if;

  if not (
    (old.status = 'draft' and new.status = 'posted')
    or (old.status = 'posted' and new.status = 'voided')
  ) then
    return new;
  end if;

  for v_source in
    select distinct l.source_document_type, l.source_document_id
    from public.finance_transaction_links l
    where l.transaction_id = new.id
      and l.source_document_type in ('hr_variable_pay','hr_advance')
      and l.source_document_id is not null
  loop
    perform private.reconcile_hr_direct_finance_source(
      v_source.source_document_type,
      v_source.source_document_id
    );
  end loop;

  return new;
end;
$function$;

drop trigger if exists trg_reconcile_hr_direct_finance_after_change on public.finance_transactions;
create trigger trg_reconcile_hr_direct_finance_after_change
after update of status on public.finance_transactions
for each row execute function private.reconcile_hr_direct_finance_after_change();

create or replace function private.prepare_hr_payroll_run(p_run_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_period public.hr_payroll_periods%rowtype;
  v_run public.hr_payroll_runs%rowtype;
  v_count integer := 0;
  v_base_currency varchar(3);
begin
  if not public.current_user_has_any_role(array['super_admin','admin','hr','finance']) then
    raise exception 'Payroll access is required';
  end if;

  select * into v_run from public.hr_payroll_runs where id = p_run_id for update;
  if not found then raise exception 'Payroll run not found'; end if;
  if v_run.status not in ('draft','calculated') then
    raise exception 'Only draft or calculated payroll runs can be prepared';
  end if;

  select * into v_period
  from public.hr_payroll_periods
  where id = v_run.payroll_period_id;

  v_base_currency := private.finance_base_currency();

  if exists (
    select 1
    from public.hr_employees e
    join lateral (
      select c.currency_code
      from public.hr_compensation_records c
      where c.employee_id = e.id
        and c.effective_from <= v_period.period_end
        and (c.effective_to is null or c.effective_to >= v_period.period_start)
      order by c.effective_from desc
      limit 1
    ) comp on true
    where e.employment_status in ('active','on_leave')
      and (e.hire_date is null or e.hire_date <= v_period.period_end)
      and (e.termination_date is null or e.termination_date >= v_period.period_start)
      and upper(comp.currency_code) is distinct from v_base_currency
  ) then
    raise exception 'Payroll compensation sources must use the company base currency.' using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.hr_variable_pay v
    where v.status = 'approved'
      and v.earning_date between v_period.period_start and v_period.period_end
      and upper(v.currency_code) is distinct from v_base_currency
      and not exists (
        select 1
        from public.finance_transaction_links l
        join public.finance_transactions t on t.id = l.transaction_id
        where l.source_document_type = 'hr_variable_pay'
          and l.source_document_id = v.id
          and t.status = 'posted'
          and t.transaction_kind in ('employee_payment','reversal')
        group by l.source_document_id
        having greatest(coalesce(sum(case when t.transaction_kind = 'reversal' then -l.allocated_amount else l.allocated_amount end),0),0) >= v.amount
      )
  ) then
    raise exception 'Payroll Variable Pay sources must use the company base currency.' using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.hr_advances a
    where a.status = 'open'
      and a.repayment_method = 'payroll'
      and a.advance_date <= v_period.period_end
      and upper(a.currency_code) is distinct from v_base_currency
  ) then
    raise exception 'Payroll Advance sources must use the company base currency.' using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.hr_employee_benefits eb
    join public.hr_benefit_plans bp on bp.id = eb.benefit_plan_id
    where eb.status = 'active'
      and eb.effective_from <= v_period.period_end
      and (eb.effective_to is null or eb.effective_to >= v_period.period_start)
      and upper(bp.currency_code) is distinct from v_base_currency
  ) then
    raise exception 'Payroll Benefit sources must use the company base currency.' using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.hr_variable_pay v
    join lateral (
      select greatest(coalesce(sum(case when t.transaction_kind = 'reversal' then -l.allocated_amount else l.allocated_amount end),0),0)::numeric(18,4) as paid_amount
      from public.finance_transaction_links l
      join public.finance_transactions t on t.id = l.transaction_id
      where l.source_document_type = 'hr_variable_pay'
        and l.source_document_id = v.id
        and t.status = 'posted'
        and t.transaction_kind in ('employee_payment','reversal')
    ) paid on true
    where v.status = 'approved'
      and v.earning_date between v_period.period_start and v_period.period_end
      and paid.paid_amount > 0
      and paid.paid_amount < v.amount
  ) then
    raise exception 'Variable Pay has a partial direct Finance settlement; complete or reverse it before Payroll preparation.' using errcode = '23514';
  end if;

  delete from public.hr_payroll_items where payroll_run_id = p_run_id;

  insert into public.hr_payroll_items(
    payroll_run_id, employee_id, regular_hours, overtime_hours, base_pay, overtime_pay,
    bonus_pay, commission_pay, other_earnings, reimbursements,
    pre_tax_deductions, post_tax_deductions, advance_repayment, employer_benefit_cost,
    tax_calculation_source, created_by, updated_by
  )
  select p_run_id,e.id,coalesce(att.regular_hours,0),coalesce(att.overtime_hours,0),earn.base_pay,earn.overtime_pay,
         coalesce(vp.bonus_pay,0),coalesce(vp.commission_pay,0),coalesce(vp.other_earnings,0),coalesce(vp.reimbursements,0),
         coalesce(ded.pre_tax,0)+coalesce(ben.employee_pre_tax,0),coalesce(ded.post_tax,0)+coalesce(ben.employee_post_tax,0),
         coalesce(adv.repayment,0),coalesce(ben.employer_cost,0),'manual',auth.uid(),auth.uid()
  from public.hr_employees e
  join lateral (
    select c.* from public.hr_compensation_records c
    where c.employee_id=e.id and c.effective_from<=v_period.period_end and (c.effective_to is null or c.effective_to>=v_period.period_start)
    order by c.effective_from desc limit 1
  ) comp on true
  left join lateral (
    select coalesce(sum(a.regular_hours),0) regular_hours,coalesce(sum(a.overtime_hours),0) overtime_hours
    from public.hr_attendance_records a where a.employee_id=e.id and a.work_date between v_period.period_start and v_period.period_end
  ) att on true
  left join lateral (
    select coalesce(sum(amount) filter(where pay_type='bonus'),0) bonus_pay,
           coalesce(sum(amount) filter(where pay_type='commission'),0) commission_pay,
           coalesce(sum(amount) filter(where pay_type in ('incentive','other')),0) other_earnings,
           coalesce(sum(amount) filter(where pay_type='reimbursement'),0) reimbursements
    from public.hr_variable_pay v
    where v.employee_id=e.id
      and v.status='approved'
      and v.earning_date between v_period.period_start and v_period.period_end
      and not exists (
        select 1
        from public.finance_transaction_links l
        join public.finance_transactions t on t.id = l.transaction_id
        where l.source_document_type = 'hr_variable_pay'
          and l.source_document_id = v.id
          and t.status = 'posted'
          and t.transaction_kind in ('employee_payment','reversal')
        group by l.source_document_id
        having greatest(coalesce(sum(case when t.transaction_kind = 'reversal' then -l.allocated_amount else l.allocated_amount end),0),0) >= v.amount
      )
  ) vp on true
  cross join lateral (
    select
      case when comp.pay_type='hourly' then round(coalesce(att.regular_hours,0)*comp.base_rate,2)
           else round(comp.base_rate / case comp.pay_frequency when 'weekly' then 52 when 'biweekly' then 26 when 'semimonthly' then 24 else 12 end,2) end base_pay,
      case when comp.pay_type='hourly' and comp.overtime_eligible then round(coalesce(att.overtime_hours,0)*comp.base_rate*comp.overtime_multiplier,2) else 0 end overtime_pay
  ) earn
  left join lateral (
    select
      coalesce(sum(case when d.tax_treatment='pre_tax' then case when d.deduction_type='fixed' then coalesce(d.amount,0) else (earn.base_pay+earn.overtime_pay+coalesce(vp.bonus_pay,0)+coalesce(vp.commission_pay,0)+coalesce(vp.other_earnings,0))*coalesce(d.percentage,0)/100 end else 0 end),0) pre_tax,
      coalesce(sum(case when d.tax_treatment='post_tax' then case when d.deduction_type='fixed' then coalesce(d.amount,0) else (earn.base_pay+earn.overtime_pay+coalesce(vp.bonus_pay,0)+coalesce(vp.commission_pay,0)+coalesce(vp.other_earnings,0))*coalesce(d.percentage,0)/100 end else 0 end),0) post_tax
    from public.hr_deductions d where d.employee_id=e.id and d.is_active and d.effective_from<=v_period.period_end and (d.effective_to is null or d.effective_to>=v_period.period_start)
  ) ded on true
  left join lateral (
    select coalesce(sum(least(a.balance_remaining,coalesce(a.installment_amount,a.balance_remaining))),0) repayment
    from public.hr_advances a where a.employee_id=e.id and a.status='open' and a.repayment_method='payroll' and a.advance_date<=v_period.period_end
  ) adv on true
  left join lateral (
    select coalesce(sum(case when bp.tax_treatment='pre_tax' then coalesce(eb.employee_cost_override,bp.employee_cost) else 0 end),0) employee_pre_tax,
           coalesce(sum(case when bp.tax_treatment='post_tax' then coalesce(eb.employee_cost_override,bp.employee_cost) else 0 end),0) employee_post_tax,
           coalesce(sum(coalesce(eb.employer_cost_override,bp.employer_cost)),0) employer_cost
    from public.hr_employee_benefits eb join public.hr_benefit_plans bp on bp.id=eb.benefit_plan_id
    where eb.employee_id=e.id and eb.status='active' and eb.effective_from<=v_period.period_end and (eb.effective_to is null or eb.effective_to>=v_period.period_start)
  ) ben on true
  where e.employment_status in ('active','on_leave') and (e.hire_date is null or e.hire_date<=v_period.period_end) and (e.termination_date is null or e.termination_date>=v_period.period_start);

  get diagnostics v_count=row_count;
  update public.hr_payroll_runs set status='calculated',calculated_at=now(),updated_by=auth.uid(),updated_at=now() where id=p_run_id;
  return v_count;
end;
$function$;

create or replace function private.save_employee_payment_draft(
  p_source_account_id uuid,
  p_amount numeric,
  p_currency_code text,
  p_transaction_at timestamptz,
  p_reference_no text,
  p_notes text,
  p_employee_id uuid,
  p_source_document_type text,
  p_source_document_id uuid,
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

  if p_employee_id is null then
    raise exception 'Employee is required for an employee payment.' using errcode = '22023';
  end if;
  if p_idempotency_key is null then
    raise exception 'Employee payment idempotency key is required.' using errcode = '22023';
  end if;

  v_fingerprint := md5(jsonb_build_object(
    'source_account_id', p_source_account_id,
    'amount', p_amount,
    'currency_code', upper(btrim(coalesce(p_currency_code,''))),
    'transaction_at', p_transaction_at,
    'reference_no', nullif(btrim(coalesce(p_reference_no,'')),''),
    'notes', nullif(btrim(coalesce(p_notes,'')),''),
    'employee_id', p_employee_id,
    'source_document_type', nullif(btrim(coalesce(p_source_document_type,'')),''),
    'source_document_id', p_source_document_id
  )::text);

  v_existing := private.finance_idempotency_existing('employee_payment_draft', p_idempotency_key, v_fingerprint);
  if v_existing is not null then
    return v_existing;
  end if;

  v_id := private.create_finance_transaction_draft(
    'employee_payment',
    p_source_account_id,
    null,
    null,
    p_amount,
    p_currency_code,
    p_transaction_at,
    p_reference_no,
    p_notes,
    p_idempotency_key
  );

  perform private.set_finance_transaction_links(v_id, jsonb_build_array(jsonb_build_object(
    'employee_id', p_employee_id,
    'source_document_type', nullif(btrim(coalesce(p_source_document_type,'')),''),
    'source_document_id', p_source_document_id,
    'allocated_amount', p_amount
  )));

  perform private.finance_store_idempotency('employee_payment_draft', p_idempotency_key, v_fingerprint, v_id);
  return v_id;
end;
$function$;

create or replace function public.save_employee_payment_draft(
  p_source_account_id uuid,
  p_amount numeric,
  p_currency_code text,
  p_transaction_at timestamptz,
  p_reference_no text,
  p_notes text,
  p_employee_id uuid,
  p_source_document_type text,
  p_source_document_id uuid,
  p_idempotency_key uuid
)
returns uuid
language sql
security definer
set search_path = ''
as $function$
  select private.save_employee_payment_draft($1,$2,$3,$4,$5,$6,$7,$8,$9,$10);
$function$;

create or replace function private.get_finance_payroll_obligations()
returns table (
  payroll_item_id uuid,
  payroll_run_id uuid,
  period_code text,
  pay_date date,
  employee_id uuid,
  employee_number text,
  employee_name text,
  currency_code varchar(3),
  net_pay numeric,
  paid_amount numeric,
  remaining_amount numeric,
  payment_status text,
  employee_withholding numeric,
  employee_deductions numeric,
  advance_repayment numeric,
  employer_payroll_taxes numeric,
  employer_benefit_cost numeric,
  total_employer_cost numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  perform private.finance_employee_payment_assert_projection_view();

  return query
  with paid as (
    select l.source_document_id as payroll_item_id,
           greatest(coalesce(sum(case when t.transaction_kind='reversal' then -l.allocated_amount else l.allocated_amount end),0),0)::numeric(18,4) as paid_amount
    from public.finance_transaction_links l
    join public.finance_transactions t on t.id = l.transaction_id
    where l.source_document_type='hr_payroll_item'
      and t.status='posted'
      and t.transaction_kind in ('employee_payment','reversal')
    group by l.source_document_id
  )
  select i.id,
         i.payroll_run_id,
         p.period_code,
         p.pay_date,
         i.employee_id,
         e.employee_number,
         concat_ws(' ',e.first_name,e.last_name)::text,
         private.finance_base_currency(),
         i.net_pay::numeric(18,4),
         coalesce(pd.paid_amount,0)::numeric(18,4),
         greatest(i.net_pay-coalesce(pd.paid_amount,0),0)::numeric(18,4),
         case
           when coalesce(pd.paid_amount,0) <= 0 then 'unpaid'
           when coalesce(pd.paid_amount,0) < i.net_pay then 'partial'
           else 'paid'
         end::text,
         (i.federal_income_tax+i.state_income_tax+i.local_income_tax+i.social_security_tax+i.medicare_tax)::numeric(18,4),
         (i.pre_tax_deductions+i.post_tax_deductions)::numeric(18,4),
         i.advance_repayment::numeric(18,4),
         i.employer_payroll_taxes::numeric(18,4),
         i.employer_benefit_cost::numeric(18,4),
         i.total_employer_cost::numeric(18,4)
  from public.hr_payroll_items i
  join public.hr_payroll_runs r on r.id=i.payroll_run_id
  join public.hr_payroll_periods p on p.id=r.payroll_period_id
  join public.hr_employees e on e.id=i.employee_id
  left join paid pd on pd.payroll_item_id=i.id
  where r.status='approved'
  order by p.pay_date, p.period_start, r.run_number, e.first_name, e.last_name, i.id;
end;
$function$;

create or replace function public.get_finance_payroll_obligations()
returns table (
  payroll_item_id uuid,
  payroll_run_id uuid,
  period_code text,
  pay_date date,
  employee_id uuid,
  employee_number text,
  employee_name text,
  currency_code varchar(3),
  net_pay numeric,
  paid_amount numeric,
  remaining_amount numeric,
  payment_status text,
  employee_withholding numeric,
  employee_deductions numeric,
  advance_repayment numeric,
  employer_payroll_taxes numeric,
  employer_benefit_cost numeric,
  total_employer_cost numeric
)
language sql
stable
security definer
set search_path = ''
as $function$
  select * from private.get_finance_payroll_obligations();
$function$;

-- Reconcile historical direct Variable Pay Finance settlements when this hardening migration lands.
with direct_paid as (
  select l.source_document_id,
         greatest(coalesce(sum(case when t.transaction_kind='reversal' then -l.allocated_amount else l.allocated_amount end),0),0)::numeric(18,4) as paid_amount
  from public.finance_transaction_links l
  join public.finance_transactions t on t.id=l.transaction_id
  where l.source_document_type='hr_variable_pay'
    and t.status='posted'
    and t.transaction_kind in ('employee_payment','reversal')
  group by l.source_document_id
)
update public.hr_variable_pay v
set status='paid', updated_by=auth.uid(), updated_at=now()
from direct_paid d
where d.source_document_id=v.id
  and v.status='approved'
  and d.paid_amount >= v.amount;

revoke all on function private.validate_finance_employee_payment_link() from public,anon,authenticated;
revoke all on function private.validate_finance_employee_payment_posting() from public,anon,authenticated;
revoke all on function private.reconcile_hr_direct_finance_source(text,uuid) from public,anon,authenticated;
revoke all on function private.reconcile_hr_direct_finance_after_change() from public,anon,authenticated;
revoke all on function private.save_employee_payment_draft(uuid,numeric,text,timestamptz,text,text,uuid,text,uuid,uuid) from public,anon,authenticated;
revoke all on function private.get_finance_payroll_obligations() from public,anon,authenticated;

revoke all on function public.save_employee_payment_draft(uuid,numeric,text,timestamptz,text,text,uuid,text,uuid,uuid) from public,anon;
revoke all on function public.get_finance_payroll_obligations() from public,anon;
grant execute on function public.save_employee_payment_draft(uuid,numeric,text,timestamptz,text,text,uuid,text,uuid,uuid) to authenticated;
grant execute on function public.get_finance_payroll_obligations() to authenticated;

notify pgrst, 'reload schema';
