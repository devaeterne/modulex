-- A6-F3D: Vendor Payment Schedule.
-- Existing-system-first rules:
--   * vendor_invoices remains the canonical AP bill and due-date truth.
--   * vendor_invoice_payment_allocations remains actual settlement truth.
--   * finance_transactions/vendor_payment remains actual money movement.
--   * payment_methods, finance_accounts and vendors are reused as optional planning context.
--   * vendor_payment_schedules is NEW because production has no AP schedule primitive.
--   * scheduled_payment_date is deliberately distinct from due_date, posted_at and cleared_at.

create schema if not exists private;

create table public.vendor_payment_schedules (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on update cascade on delete restrict,
  invoice_id uuid not null references public.vendor_invoices(id) on update cascade on delete restrict,
  scheduled_payment_date date not null,
  planned_amount numeric(18,4) not null check (planned_amount > 0),
  currency_code varchar(3) not null check (length(currency_code) = 3),
  payment_method_id uuid null references public.payment_methods(id) on update cascade on delete restrict,
  source_account_id uuid null references public.finance_accounts(id) on update cascade on delete restrict,
  status text not null default 'planned' check (status in ('planned','cancelled')),
  cancellation_reason text null,
  cancelled_at timestamptz null,
  cancelled_by uuid null references public.profiles(id) on delete set null,
  notes text null,
  request_key uuid not null unique,
  created_by uuid null references public.profiles(id) on delete set null,
  updated_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vendor_payment_schedules_cancel_check check (
    (status='planned' and cancellation_reason is null and cancelled_at is null and cancelled_by is null)
    or (status='cancelled' and nullif(btrim(coalesce(cancellation_reason,'')),'') is not null and cancelled_at is not null)
  )
);
create index vendor_payment_schedules_invoice_idx on public.vendor_payment_schedules(invoice_id,status,scheduled_payment_date,id);
create index vendor_payment_schedules_vendor_idx on public.vendor_payment_schedules(vendor_id,status,scheduled_payment_date,id);
create index vendor_payment_schedules_date_idx on public.vendor_payment_schedules(status,scheduled_payment_date,id);
create index vendor_payment_schedules_method_idx on public.vendor_payment_schedules(payment_method_id) where payment_method_id is not null;
create index vendor_payment_schedules_account_idx on public.vendor_payment_schedules(source_account_id) where source_account_id is not null;

create table public.vendor_payment_schedule_audit (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.vendor_payment_schedules(id) on update cascade on delete restrict,
  action_type text not null check (action_type in ('create','update','cancel')),
  before_snapshot jsonb null,
  after_snapshot jsonb null,
  reason text null,
  actor_id uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index vendor_payment_schedule_audit_schedule_idx on public.vendor_payment_schedule_audit(schedule_id,created_at,id);

alter table public.vendor_payment_schedules enable row level security;
alter table public.vendor_payment_schedule_audit enable row level security;

create or replace function private.guard_vendor_payment_schedule_flow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op='DELETE' then
    raise exception 'Payment schedule history cannot be deleted; cancel the plan instead.' using errcode='23514';
  end if;
  if coalesce(current_setting('modulex.vendor_payment_schedule_flow',true),'') <> 'on' then
    raise exception 'Payment schedules must be changed through the canonical Finance schedule flow.' using errcode='23514';
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_guard_vendor_payment_schedule_flow on public.vendor_payment_schedules;
create trigger trg_guard_vendor_payment_schedule_flow
before insert or update or delete on public.vendor_payment_schedules
for each row execute function private.guard_vendor_payment_schedule_flow();

create or replace function private.guard_vendor_payment_schedule_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  raise exception 'Payment schedule audit history is append-only.' using errcode='23514';
end;
$function$;
create trigger trg_vendor_payment_schedule_audit_append_only
before update or delete on public.vendor_payment_schedule_audit
for each row execute function private.guard_vendor_payment_schedule_audit();

create or replace function private.vendor_payment_schedule_audit_write(
  p_schedule_id uuid,p_action text,p_before jsonb,p_after jsonb,p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.vendor_payment_schedule_audit(schedule_id,action_type,before_snapshot,after_snapshot,reason,actor_id)
  values(p_schedule_id,p_action,p_before,p_after,nullif(btrim(coalesce(p_reason,'')),''),auth.uid());
end;
$function$;

create or replace function private.vendor_invoice_paid_amount(p_invoice_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(sum(a.amount_delta),0)::numeric
  from public.vendor_invoice_payment_allocations a
  where a.invoice_id=$1;
$function$;

create or replace function private.vendor_invoice_planned_amount(p_invoice_id uuid,p_exclude_schedule_id uuid default null)
returns numeric
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(sum(s.planned_amount),0)::numeric
  from public.vendor_payment_schedules s
  where s.invoice_id=$1 and s.status='planned' and (p_exclude_schedule_id is null or s.id<>p_exclude_schedule_id);
$function$;

create or replace function private.validate_vendor_payment_schedule_context(
  p_vendor_id uuid,p_invoice_id uuid,p_planned_amount numeric,p_currency_code text,
  p_payment_method_id uuid default null,p_source_account_id uuid default null,p_exclude_schedule_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_invoice public.vendor_invoices%rowtype;
  v_vendor public.vendors%rowtype;
  v_method public.payment_methods%rowtype;
  v_account public.finance_accounts%rowtype;
  v_paid numeric;
  v_planned numeric;
  v_outstanding numeric;
begin
  select * into v_invoice from public.vendor_invoices where id=p_invoice_id for share;
  if v_invoice.id is null or v_invoice.status<>'open' then
    raise exception 'Payment Schedule requires an open canonical Vendor Bill.' using errcode='23514';
  end if;
  if v_invoice.vendor_id is distinct from p_vendor_id then
    raise exception 'Payment Schedule Vendor must match the Vendor Bill.' using errcode='23514';
  end if;
  select * into v_vendor from public.vendors where id=p_vendor_id;
  if v_vendor.id is null or v_vendor.status='inactive' then
    raise exception 'Payment Schedule requires an active canonical Vendor.' using errcode='23514';
  end if;
  if p_planned_amount is null or p_planned_amount<=0 then
    raise exception 'Planned payment amount must be greater than zero.' using errcode='22023';
  end if;
  if upper(btrim(coalesce(p_currency_code,''))) is distinct from v_invoice.currency_code then
    raise exception 'Payment Schedule currency must match the Vendor Bill currency.' using errcode='23514';
  end if;

  if p_payment_method_id is not null then
    select * into v_method from public.payment_methods where id=p_payment_method_id;
    if v_method.id is null or not v_method.is_active then
      raise exception 'Planned Payment Method must be active.' using errcode='23514';
    end if;
  end if;
  if p_source_account_id is not null then
    select * into v_account from public.finance_accounts where id=p_source_account_id;
    if v_account.id is null or not v_account.is_active then
      raise exception 'Planned source Finance account must be active.' using errcode='23514';
    end if;
    if v_account.currency_code is distinct from v_invoice.currency_code then
      raise exception 'Planned source account currency must match the Vendor Bill currency.' using errcode='23514';
    end if;
  end if;

  v_paid:=private.vendor_invoice_paid_amount(p_invoice_id);
  v_outstanding:=greatest(v_invoice.total_amount-v_paid,0);
  v_planned:=private.vendor_invoice_planned_amount(p_invoice_id,p_exclude_schedule_id);
  if p_planned_amount+v_planned>v_outstanding+0.0001 then
    raise exception 'Active Payment Schedule amount cannot exceed the Vendor Bill outstanding balance.' using errcode='23514';
  end if;
end;
$function$;

create or replace function private.get_vendor_payment_schedule_reference_data()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  perform private.finance_assert_view();
  return jsonb_build_object(
    'vendors',coalesce((
      select jsonb_agg(jsonb_build_object('id',v.id,'code',v.code,'name',v.display_name,'currency_code',v.default_currency_code) order by v.display_name,v.id)
      from public.vendors v where v.status<>'inactive'
    ),'[]'::jsonb),
    'bills',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',i.id,'vendor_id',i.vendor_id,'invoice_number',i.invoice_number,'vendor_name',i.vendor_name_snapshot,
        'due_date',i.due_date,'total_amount',i.total_amount,'currency_code',i.currency_code,
        'paid_amount',coalesce(pa.paid_amount,0),'outstanding_amount',greatest(i.total_amount-coalesce(pa.paid_amount,0),0),
        'scheduled_amount',coalesce(sp.scheduled_amount,0),'unscheduled_amount',greatest(i.total_amount-coalesce(pa.paid_amount,0)-coalesce(sp.scheduled_amount,0),0)
      ) order by i.due_date nulls last,i.invoice_number,i.id)
      from public.vendor_invoices i
      left join lateral (select coalesce(sum(a.amount_delta),0) paid_amount from public.vendor_invoice_payment_allocations a where a.invoice_id=i.id) pa on true
      left join lateral (select coalesce(sum(s.planned_amount),0) scheduled_amount from public.vendor_payment_schedules s where s.invoice_id=i.id and s.status='planned') sp on true
      where i.status='open' and greatest(i.total_amount-coalesce(pa.paid_amount,0),0)>0
    ),'[]'::jsonb),
    'payment_methods',coalesce((
      select jsonb_agg(jsonb_build_object('id',pm.id,'system_key',pm.system_key,'name',pm.name) order by pm.sort_order,pm.name,pm.id)
      from public.payment_methods pm where pm.is_active
    ),'[]'::jsonb),
    'accounts',coalesce((
      select jsonb_agg(jsonb_build_object('id',a.id,'name',a.name,'code',a.code,'currency_code',a.currency_code,'account_type',a.account_type) order by a.name,a.id)
      from public.finance_accounts a where a.is_active
    ),'[]'::jsonb)
  );
end;
$function$;

create or replace function private.get_vendor_payment_schedules_page(
  p_limit integer default 50,p_offset integer default 0,p_vendor_id uuid default null,p_invoice_id uuid default null,
  p_status text default null,p_date_from date default null,p_date_to date default null,p_search text default null
)
returns table(
  id uuid,vendor_id uuid,vendor_code text,vendor_name text,invoice_id uuid,invoice_number text,due_date date,
  scheduled_payment_date date,planned_amount numeric,currency_code varchar,payment_method_id uuid,payment_method_name text,
  source_account_id uuid,source_account_name text,status text,display_status text,notes text,
  bill_total_amount numeric,paid_amount numeric,outstanding_amount numeric,active_scheduled_amount numeric,scheduled_remaining_amount numeric,
  created_at timestamptz,updated_at timestamptz,total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  perform private.finance_assert_view();
  return query
  select s.id,s.vendor_id,v.code,v.display_name,s.invoice_id,i.invoice_number,i.due_date,
    s.scheduled_payment_date,s.planned_amount,s.currency_code,s.payment_method_id,pm.name,
    s.source_account_id,fa.name,s.status,
    case
      when s.status='cancelled' then 'cancelled'
      when greatest(i.total_amount-coalesce(pa.paid_amount,0),0)<=0 then 'settled'
      when s.scheduled_payment_date<current_date then 'overdue'
      else 'planned'
    end,
    s.notes,i.total_amount,coalesce(pa.paid_amount,0)::numeric,greatest(i.total_amount-coalesce(pa.paid_amount,0),0)::numeric,
    coalesce(sp.scheduled_amount,0)::numeric,greatest(i.total_amount-coalesce(pa.paid_amount,0)-coalesce(sp.scheduled_amount,0),0)::numeric,
    s.created_at,s.updated_at,count(*) over()
  from public.vendor_payment_schedules s
  join public.vendor_invoices i on i.id=s.invoice_id
  join public.vendors v on v.id=s.vendor_id
  left join public.payment_methods pm on pm.id=s.payment_method_id
  left join public.finance_accounts fa on fa.id=s.source_account_id
  left join lateral (select coalesce(sum(a.amount_delta),0) paid_amount from public.vendor_invoice_payment_allocations a where a.invoice_id=i.id) pa on true
  left join lateral (select coalesce(sum(x.planned_amount),0) scheduled_amount from public.vendor_payment_schedules x where x.invoice_id=i.id and x.status='planned') sp on true
  where (p_vendor_id is null or s.vendor_id=p_vendor_id)
    and (p_invoice_id is null or s.invoice_id=p_invoice_id)
    and (p_status is null or s.status=p_status or (p_status='overdue' and s.status='planned' and s.scheduled_payment_date<current_date))
    and (p_date_from is null or s.scheduled_payment_date>=p_date_from)
    and (p_date_to is null or s.scheduled_payment_date<=p_date_to)
    and (nullif(btrim(coalesce(p_search,'')),'') is null
      or v.display_name ilike '%'||btrim(p_search)||'%'
      or v.code ilike '%'||btrim(p_search)||'%'
      or i.invoice_number ilike '%'||btrim(p_search)||'%'
      or coalesce(s.notes,'') ilike '%'||btrim(p_search)||'%')
  order by s.scheduled_payment_date,s.created_at,s.id
  limit least(greatest(coalesce(p_limit,50),1),200) offset greatest(coalesce(p_offset,0),0);
end;
$function$;

create or replace function private.create_vendor_payment_schedule(
  p_vendor_id uuid,p_invoice_id uuid,p_scheduled_payment_date date,p_planned_amount numeric,p_currency_code text,
  p_payment_method_id uuid default null,p_source_account_id uuid default null,p_notes text default null,p_request_key uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare v_id uuid; v_existing uuid;
begin
  perform private.finance_assert_manage();
  if p_scheduled_payment_date is null then raise exception 'Scheduled payment date is required.' using errcode='22023'; end if;
  if p_request_key is null then raise exception 'Payment Schedule request key is required.' using errcode='22023'; end if;
  select s.id into v_existing from public.vendor_payment_schedules s where s.request_key=p_request_key;
  if v_existing is not null then return v_existing; end if;
  perform private.validate_vendor_payment_schedule_context(p_vendor_id,p_invoice_id,p_planned_amount,p_currency_code,p_payment_method_id,p_source_account_id,null);
  perform set_config('modulex.vendor_payment_schedule_flow','on',true);
  insert into public.vendor_payment_schedules(vendor_id,invoice_id,scheduled_payment_date,planned_amount,currency_code,payment_method_id,source_account_id,notes,request_key,created_by,updated_by)
  values(p_vendor_id,p_invoice_id,p_scheduled_payment_date,p_planned_amount,upper(btrim(p_currency_code)),p_payment_method_id,p_source_account_id,nullif(btrim(coalesce(p_notes,'')),''),p_request_key,auth.uid(),auth.uid())
  returning id into v_id;
  perform set_config('modulex.vendor_payment_schedule_flow','',true);
  perform private.vendor_payment_schedule_audit_write(v_id,'create',null,(select to_jsonb(s) from public.vendor_payment_schedules s where s.id=v_id));
  return v_id;
end;
$function$;

create or replace function private.update_vendor_payment_schedule(
  p_schedule_id uuid,p_scheduled_payment_date date,p_planned_amount numeric,p_payment_method_id uuid default null,
  p_source_account_id uuid default null,p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare v_schedule public.vendor_payment_schedules%rowtype; v_before jsonb;
begin
  perform private.finance_assert_manage();
  select * into v_schedule from public.vendor_payment_schedules where id=p_schedule_id for update;
  if v_schedule.id is null or v_schedule.status<>'planned' then raise exception 'Editable planned Payment Schedule not found.' using errcode='23514'; end if;
  if p_scheduled_payment_date is null then raise exception 'Scheduled payment date is required.' using errcode='22023'; end if;
  perform private.validate_vendor_payment_schedule_context(v_schedule.vendor_id,v_schedule.invoice_id,p_planned_amount,v_schedule.currency_code,p_payment_method_id,p_source_account_id,v_schedule.id);
  v_before:=to_jsonb(v_schedule);
  perform set_config('modulex.vendor_payment_schedule_flow','on',true);
  update public.vendor_payment_schedules
  set scheduled_payment_date=p_scheduled_payment_date,planned_amount=p_planned_amount,payment_method_id=p_payment_method_id,
      source_account_id=p_source_account_id,notes=nullif(btrim(coalesce(p_notes,'')),''),updated_by=auth.uid(),updated_at=now()
  where id=v_schedule.id;
  perform set_config('modulex.vendor_payment_schedule_flow','',true);
  perform private.vendor_payment_schedule_audit_write(v_schedule.id,'update',v_before,(select to_jsonb(s) from public.vendor_payment_schedules s where s.id=v_schedule.id));
  return v_schedule.id;
end;
$function$;

create or replace function private.cancel_vendor_payment_schedule(p_schedule_id uuid,p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare v_schedule public.vendor_payment_schedules%rowtype; v_before jsonb;
begin
  perform private.finance_assert_manage();
  if nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception 'Payment Schedule cancellation reason is required.' using errcode='22023'; end if;
  select * into v_schedule from public.vendor_payment_schedules where id=p_schedule_id for update;
  if v_schedule.id is null then raise exception 'Payment Schedule not found.' using errcode='23503'; end if;
  if v_schedule.status='cancelled' then return v_schedule.id; end if;
  v_before:=to_jsonb(v_schedule);
  perform set_config('modulex.vendor_payment_schedule_flow','on',true);
  update public.vendor_payment_schedules
  set status='cancelled',cancellation_reason=btrim(p_reason),cancelled_at=now(),cancelled_by=auth.uid(),updated_by=auth.uid(),updated_at=now()
  where id=v_schedule.id;
  perform set_config('modulex.vendor_payment_schedule_flow','',true);
  perform private.vendor_payment_schedule_audit_write(v_schedule.id,'cancel',v_before,(select to_jsonb(s) from public.vendor_payment_schedules s where s.id=v_schedule.id),p_reason);
  return v_schedule.id;
end;
$function$;

-- Protected public wrappers.
create or replace function public.get_vendor_payment_schedule_reference_data() returns jsonb
language sql stable security definer set search_path='' as $function$ select private.get_vendor_payment_schedule_reference_data();$function$;
create or replace function public.get_vendor_payment_schedules_page(p_limit integer default 50,p_offset integer default 0,p_vendor_id uuid default null,p_invoice_id uuid default null,p_status text default null,p_date_from date default null,p_date_to date default null,p_search text default null)
returns table(id uuid,vendor_id uuid,vendor_code text,vendor_name text,invoice_id uuid,invoice_number text,due_date date,scheduled_payment_date date,planned_amount numeric,currency_code varchar,payment_method_id uuid,payment_method_name text,source_account_id uuid,source_account_name text,status text,display_status text,notes text,bill_total_amount numeric,paid_amount numeric,outstanding_amount numeric,active_scheduled_amount numeric,scheduled_remaining_amount numeric,created_at timestamptz,updated_at timestamptz,total_count bigint)
language sql stable security definer set search_path='' as $function$ select * from private.get_vendor_payment_schedules_page($1,$2,$3,$4,$5,$6,$7,$8);$function$;
create or replace function public.create_vendor_payment_schedule(p_vendor_id uuid,p_invoice_id uuid,p_scheduled_payment_date date,p_planned_amount numeric,p_currency_code text,p_payment_method_id uuid default null,p_source_account_id uuid default null,p_notes text default null,p_request_key uuid default null) returns uuid
language sql security definer set search_path='' as $function$ select private.create_vendor_payment_schedule($1,$2,$3,$4,$5,$6,$7,$8,$9);$function$;
create or replace function public.update_vendor_payment_schedule(p_schedule_id uuid,p_scheduled_payment_date date,p_planned_amount numeric,p_payment_method_id uuid default null,p_source_account_id uuid default null,p_notes text default null) returns uuid
language sql security definer set search_path='' as $function$ select private.update_vendor_payment_schedule($1,$2,$3,$4,$5,$6);$function$;
create or replace function public.cancel_vendor_payment_schedule(p_schedule_id uuid,p_reason text) returns uuid
language sql security definer set search_path='' as $function$ select private.cancel_vendor_payment_schedule($1,$2);$function$;

revoke all on public.vendor_payment_schedules from public,anon,authenticated;
revoke all on public.vendor_payment_schedule_audit from public,anon,authenticated;
create policy vendor_payment_schedules_anon_deny on public.vendor_payment_schedules as restrictive for all to anon using(false) with check(false);
create policy vendor_payment_schedules_authenticated_deny on public.vendor_payment_schedules as restrictive for all to authenticated using(false) with check(false);
create policy vendor_payment_schedule_audit_anon_deny on public.vendor_payment_schedule_audit as restrictive for all to anon using(false) with check(false);
create policy vendor_payment_schedule_audit_authenticated_deny on public.vendor_payment_schedule_audit as restrictive for all to authenticated using(false) with check(false);

revoke all on function private.guard_vendor_payment_schedule_flow() from public,anon,authenticated,service_role;
revoke all on function private.guard_vendor_payment_schedule_audit() from public,anon,authenticated,service_role;
revoke all on function private.vendor_payment_schedule_audit_write(uuid,text,jsonb,jsonb,text) from public,anon,authenticated,service_role;
revoke all on function private.vendor_invoice_paid_amount(uuid) from public,anon,authenticated,service_role;
revoke all on function private.vendor_invoice_planned_amount(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function private.validate_vendor_payment_schedule_context(uuid,uuid,numeric,text,uuid,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function private.get_vendor_payment_schedule_reference_data() from public,anon,authenticated,service_role;
revoke all on function private.get_vendor_payment_schedules_page(integer,integer,uuid,uuid,text,date,date,text) from public,anon,authenticated,service_role;
revoke all on function private.create_vendor_payment_schedule(uuid,uuid,date,numeric,text,uuid,uuid,text,uuid) from public,anon,authenticated,service_role;
revoke all on function private.update_vendor_payment_schedule(uuid,date,numeric,uuid,uuid,text) from public,anon,authenticated,service_role;
revoke all on function private.cancel_vendor_payment_schedule(uuid,text) from public,anon,authenticated,service_role;

revoke execute on function public.get_vendor_payment_schedule_reference_data() from public,anon;
revoke execute on function public.get_vendor_payment_schedules_page(integer,integer,uuid,uuid,text,date,date,text) from public,anon;
revoke execute on function public.create_vendor_payment_schedule(uuid,uuid,date,numeric,text,uuid,uuid,text,uuid) from public,anon;
revoke execute on function public.update_vendor_payment_schedule(uuid,date,numeric,uuid,uuid,text) from public,anon;
revoke execute on function public.cancel_vendor_payment_schedule(uuid,text) from public,anon;

grant execute on function public.get_vendor_payment_schedule_reference_data() to authenticated,service_role;
grant execute on function public.get_vendor_payment_schedules_page(integer,integer,uuid,uuid,text,date,date,text) to authenticated,service_role;
grant execute on function public.create_vendor_payment_schedule(uuid,uuid,date,numeric,text,uuid,uuid,text,uuid) to authenticated,service_role;
grant execute on function public.update_vendor_payment_schedule(uuid,date,numeric,uuid,uuid,text) to authenticated,service_role;
grant execute on function public.cancel_vendor_payment_schedule(uuid,text) to authenticated,service_role;
