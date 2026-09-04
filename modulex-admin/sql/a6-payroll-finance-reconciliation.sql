-- A6 Finance/HR reconciliation: Finance remains canonical for actual employee money movement.
-- HR variable-pay and advance repayment side effects are applied only after full payroll-item settlement.

create table if not exists public.hr_payroll_finance_settlement_state (
  payroll_item_id uuid primary key references public.hr_payroll_items(id) on update cascade on delete restrict,
  paid_amount numeric(18,4) not null default 0 check (paid_amount >= 0),
  is_fully_settled boolean not null default false,
  settlement_cycle integer not null default 0 check (settlement_cycle >= 0),
  settled_at timestamptz null,
  reopened_at timestamptz null,
  last_reconciled_at timestamptz not null default now(),
  updated_by uuid null references public.profiles(id) on delete set null
);

create table if not exists public.hr_payroll_finance_settlement_effects (
  id uuid primary key default gen_random_uuid(),
  payroll_item_id uuid not null references public.hr_payroll_items(id) on update cascade on delete restrict,
  settlement_cycle integer not null check (settlement_cycle > 0),
  effect_type text not null check (effect_type in ('variable_pay','advance_repayment')),
  source_id uuid not null,
  applied_amount numeric(18,4) not null default 0 check (applied_amount >= 0),
  previous_status text null,
  previous_balance numeric(18,4) null,
  effect_status text not null default 'applied' check (effect_status in ('applied','reverted')),
  applied_at timestamptz not null default now(),
  reverted_at timestamptz null,
  actor_id uuid null references public.profiles(id) on delete set null,
  constraint hr_payroll_finance_effect_unique unique (payroll_item_id, settlement_cycle, effect_type, source_id)
);

create index if not exists hr_payroll_finance_effect_item_idx
  on public.hr_payroll_finance_settlement_effects(payroll_item_id, settlement_cycle, effect_status);
create index if not exists hr_payroll_finance_effect_source_idx
  on public.hr_payroll_finance_settlement_effects(effect_type, source_id, effect_status);

alter table public.hr_payroll_finance_settlement_state enable row level security;
alter table public.hr_payroll_finance_settlement_effects enable row level security;

revoke all on table public.hr_payroll_finance_settlement_state from public,anon,authenticated;
revoke all on table public.hr_payroll_finance_settlement_effects from public,anon,authenticated;

create or replace function private.get_hr_payroll_finance_paid_amount(p_payroll_item_id uuid)
returns numeric(18,4)
language sql
stable
security definer
set search_path = ''
as $function$
  select greatest(coalesce(sum(
    case when t.transaction_kind = 'reversal' then -l.allocated_amount else l.allocated_amount end
  ),0),0)::numeric(18,4)
  from public.finance_transaction_links l
  join public.finance_transactions t on t.id = l.transaction_id
  where l.source_document_type = 'hr_payroll_item'
    and l.source_document_id = p_payroll_item_id
    and t.status = 'posted'
    and t.transaction_kind in ('employee_payment','reversal');
$function$;

create or replace function private.reconcile_hr_payroll_finance_item(p_payroll_item_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_item record;
  v_state public.hr_payroll_finance_settlement_state%rowtype;
  v_paid_amount numeric(18,4);
  v_is_fully_settled boolean;
  v_was_fully_settled boolean;
  v_cycle integer;
  v_variable_bonus numeric(18,4);
  v_variable_commission numeric(18,4);
  v_variable_other numeric(18,4);
  v_variable_reimbursements numeric(18,4);
  v_advance_total numeric(18,4);
  v_conflict_count integer;
begin
  select i.*, r.status as run_status, p.period_start, p.period_end
  into v_item
  from public.hr_payroll_items i
  join public.hr_payroll_runs r on r.id = i.payroll_run_id
  join public.hr_payroll_periods p on p.id = r.payroll_period_id
  where i.id = p_payroll_item_id
  for update of i;

  if not found then
    raise exception 'Payroll reconciliation item not found.' using errcode = '23503';
  end if;
  if v_item.run_status <> 'approved' then
    raise exception 'Payroll reconciliation requires an approved payroll run.' using errcode = '23514';
  end if;

  insert into public.hr_payroll_finance_settlement_state(payroll_item_id, updated_by)
  values (p_payroll_item_id, auth.uid())
  on conflict (payroll_item_id) do nothing;

  select * into v_state
  from public.hr_payroll_finance_settlement_state s
  where s.payroll_item_id = p_payroll_item_id
  for update;

  v_paid_amount := private.get_hr_payroll_finance_paid_amount(p_payroll_item_id);
  v_is_fully_settled := v_paid_amount >= v_item.net_pay;
  v_was_fully_settled := v_state.is_fully_settled;

  if not v_was_fully_settled and v_is_fully_settled then
    select
      coalesce(sum(v.amount) filter (where v.pay_type = 'bonus'),0)::numeric(18,4),
      coalesce(sum(v.amount) filter (where v.pay_type = 'commission'),0)::numeric(18,4),
      coalesce(sum(v.amount) filter (where v.pay_type in ('incentive','other')),0)::numeric(18,4),
      coalesce(sum(v.amount) filter (where v.pay_type = 'reimbursement'),0)::numeric(18,4)
    into v_variable_bonus, v_variable_commission, v_variable_other, v_variable_reimbursements
    from public.hr_variable_pay v
    where v.employee_id = v_item.employee_id
      and v.status = 'approved'
      and v.earning_date between v_item.period_start and v_item.period_end;

    if v_variable_bonus is distinct from v_item.bonus_pay
       or v_variable_commission is distinct from v_item.commission_pay
       or v_variable_other is distinct from v_item.other_earnings
       or v_variable_reimbursements is distinct from v_item.reimbursements then
      raise exception 'Payroll variable-pay sources no longer match the approved payroll snapshot.' using errcode = '23514';
    end if;

    select coalesce(sum(least(a.balance_remaining,coalesce(a.installment_amount,a.balance_remaining))),0)::numeric(18,4)
    into v_advance_total
    from public.hr_advances a
    where a.employee_id = v_item.employee_id
      and a.status = 'open'
      and a.repayment_method = 'payroll'
      and a.advance_date <= v_item.period_end;

    if v_advance_total is distinct from v_item.advance_repayment then
      raise exception 'Payroll advance sources no longer match the approved payroll snapshot.' using errcode = '23514';
    end if;

    v_cycle := v_state.settlement_cycle + 1;

    insert into public.hr_payroll_finance_settlement_effects(
      payroll_item_id, settlement_cycle, effect_type, source_id, applied_amount,
      previous_status, previous_balance, effect_status, actor_id
    )
    select p_payroll_item_id, v_cycle, 'variable_pay', v.id, v.amount,
           v.status, null, 'applied', auth.uid()
    from public.hr_variable_pay v
    where v.employee_id = v_item.employee_id
      and v.status = 'approved'
      and v.earning_date between v_item.period_start and v_item.period_end;

    update public.hr_variable_pay v
    set status = 'paid', updated_by = auth.uid(), updated_at = now()
    where exists (
      select 1
      from public.hr_payroll_finance_settlement_effects e
      where e.payroll_item_id = p_payroll_item_id
        and e.settlement_cycle = v_cycle
        and e.effect_type = 'variable_pay'
        and e.source_id = v.id
        and e.effect_status = 'applied'
    );

    insert into public.hr_payroll_finance_settlement_effects(
      payroll_item_id, settlement_cycle, effect_type, source_id, applied_amount,
      previous_status, previous_balance, effect_status, actor_id
    )
    select p_payroll_item_id, v_cycle, 'advance_repayment', a.id,
           least(a.balance_remaining,coalesce(a.installment_amount,a.balance_remaining))::numeric(18,4),
           a.status, a.balance_remaining, 'applied', auth.uid()
    from public.hr_advances a
    where a.employee_id = v_item.employee_id
      and a.status = 'open'
      and a.repayment_method = 'payroll'
      and a.advance_date <= v_item.period_end
      and least(a.balance_remaining,coalesce(a.installment_amount,a.balance_remaining)) > 0;

    update public.hr_advances a
    set balance_remaining = greatest(0,a.balance_remaining-e.applied_amount),
        status = case when greatest(0,a.balance_remaining-e.applied_amount) = 0 then 'paid' else 'open' end,
        updated_by = auth.uid(), updated_at = now()
    from public.hr_payroll_finance_settlement_effects e
    where e.payroll_item_id = p_payroll_item_id
      and e.settlement_cycle = v_cycle
      and e.effect_type = 'advance_repayment'
      and e.effect_status = 'applied'
      and e.source_id = a.id;

    update public.hr_payroll_finance_settlement_state
    set paid_amount = v_paid_amount,
        is_fully_settled = true,
        settlement_cycle = v_cycle,
        settled_at = now(),
        reopened_at = null,
        last_reconciled_at = now(),
        updated_by = auth.uid()
    where payroll_item_id = p_payroll_item_id;

  elsif v_was_fully_settled and not v_is_fully_settled then
    v_cycle := v_state.settlement_cycle;

    select count(*) into v_conflict_count
    from public.hr_payroll_finance_settlement_effects e
    join public.hr_variable_pay v on v.id = e.source_id
    where e.payroll_item_id = p_payroll_item_id
      and e.settlement_cycle = v_cycle
      and e.effect_type = 'variable_pay'
      and e.effect_status = 'applied'
      and v.status <> 'paid';

    if v_conflict_count > 0 then
      raise exception 'Payroll variable-pay state changed after Finance settlement; reversal requires manual reconciliation.' using errcode = '23514';
    end if;

    select count(*) into v_conflict_count
    from public.hr_payroll_finance_settlement_effects e
    join public.hr_advances a on a.id = e.source_id
    where e.payroll_item_id = p_payroll_item_id
      and e.settlement_cycle = v_cycle
      and e.effect_type = 'advance_repayment'
      and e.effect_status = 'applied'
      and a.status not in ('open','paid');

    if v_conflict_count > 0 then
      raise exception 'Payroll advance state changed after Finance settlement; reversal requires manual reconciliation.' using errcode = '23514';
    end if;

    update public.hr_variable_pay v
    set status = coalesce(e.previous_status,'approved'), updated_by = auth.uid(), updated_at = now()
    from public.hr_payroll_finance_settlement_effects e
    where e.payroll_item_id = p_payroll_item_id
      and e.settlement_cycle = v_cycle
      and e.effect_type = 'variable_pay'
      and e.effect_status = 'applied'
      and e.source_id = v.id;

    update public.hr_advances a
    set balance_remaining = least(a.amount,a.balance_remaining+e.applied_amount),
        status = coalesce(e.previous_status,'open'),
        updated_by = auth.uid(), updated_at = now()
    from public.hr_payroll_finance_settlement_effects e
    where e.payroll_item_id = p_payroll_item_id
      and e.settlement_cycle = v_cycle
      and e.effect_type = 'advance_repayment'
      and e.effect_status = 'applied'
      and e.source_id = a.id;

    update public.hr_payroll_finance_settlement_effects
    set effect_status = 'reverted', reverted_at = now()
    where payroll_item_id = p_payroll_item_id
      and settlement_cycle = v_cycle
      and effect_status = 'applied';

    update public.hr_payroll_finance_settlement_state
    set paid_amount = v_paid_amount,
        is_fully_settled = false,
        reopened_at = now(),
        last_reconciled_at = now(),
        updated_by = auth.uid()
    where payroll_item_id = p_payroll_item_id;

  else
    update public.hr_payroll_finance_settlement_state
    set paid_amount = v_paid_amount,
        last_reconciled_at = now(),
        updated_by = auth.uid()
    where payroll_item_id = p_payroll_item_id;
  end if;
end;
$function$;

create or replace function private.reconcile_hr_payroll_finance_after_post()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_payroll_item_id uuid;
begin
  if tg_op <> 'UPDATE' then return new; end if;

  if not (
    (old.status = 'draft' and new.status = 'posted' and new.transaction_kind in ('employee_payment','reversal'))
    or
    (old.status = 'posted' and new.status = 'voided' and new.transaction_kind = 'employee_payment')
  ) then
    return new;
  end if;

  for v_payroll_item_id in
    select distinct l.source_document_id
    from public.finance_transaction_links l
    where l.transaction_id = new.id
      and l.source_document_type = 'hr_payroll_item'
      and l.source_document_id is not null
  loop
    perform private.reconcile_hr_payroll_finance_item(v_payroll_item_id);
  end loop;

  return new;
end;
$function$;

drop trigger if exists trg_reconcile_hr_payroll_finance_after_post on public.finance_transactions;
create trigger trg_reconcile_hr_payroll_finance_after_post
after update of status on public.finance_transactions
for each row execute function private.reconcile_hr_payroll_finance_after_post();

-- Manual Payroll "paid" status is no longer allowed to manufacture money-movement side effects.
-- Payroll remains approved while item-level Paid/Partial/Unpaid is derived from Finance settlement.
create or replace function private.set_hr_payroll_run_status(p_run_id uuid, p_status text)
returns text
language plpgsql
security definer
set search_path = 'public', 'private', 'pg_temp'
as $function$
declare v_run public.hr_payroll_runs%rowtype;
begin
  if not public.current_user_has_any_role(array['super_admin','admin','hr','finance']) then
    raise exception 'Payroll access is required';
  end if;
  if p_status = 'paid' then
    raise exception 'Payroll paid status is Finance-derived; post employee payments in Finance instead.' using errcode = '23514';
  end if;
  if p_status not in ('draft','calculated','approved','void') then
    raise exception 'Invalid payroll run status';
  end if;

  select * into v_run from public.hr_payroll_runs where id=p_run_id for update;
  if not found then raise exception 'Payroll run not found'; end if;
  if p_status='approved' and v_run.status<>'calculated' then raise exception 'Only calculated payroll can be approved'; end if;

  update public.hr_payroll_runs
  set status=p_status,
      approved_at=case when p_status='approved' then now() else approved_at end,
      approved_by=case when p_status='approved' then auth.uid() else approved_by end,
      updated_by=auth.uid(),updated_at=now()
  where id=p_run_id;

  return p_status;
end;
$function$;

revoke all on function private.get_hr_payroll_finance_paid_amount(uuid) from public,anon,authenticated;
revoke all on function private.reconcile_hr_payroll_finance_item(uuid) from public,anon,authenticated;
revoke all on function private.reconcile_hr_payroll_finance_after_post() from public,anon,authenticated;

notify pgrst, 'reload schema';
