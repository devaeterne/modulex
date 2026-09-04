-- PB-6 — Project Participants & Commission Obligation Ledger
-- Project owns participant assignment and commission entitlement only.
-- Actual money movement remains Finance-owned and is attributed through finance_transaction_links.

create table if not exists public.project_participant_roles (
  id uuid primary key default gen_random_uuid(),
  role_key text not null unique check (role_key ~ '^[a-z][a-z0-9_]*$'),
  label text not null check (length(btrim(label)) > 0),
  is_system boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 100,
  created_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.project_participant_roles is 'Configurable Project participant roles. Built-ins are marked is_system.';

insert into public.project_participant_roles (role_key, label, is_system, sort_order)
values
  ('sales_rep', 'Sales Rep', true, 10),
  ('designer', 'Designer', true, 20),
  ('contractor', 'Contractor', true, 30),
  ('installer', 'Installer', true, 40),
  ('referral_partner', 'Referral Partner', true, 50),
  ('project_manager', 'Project Manager', true, 60)
on conflict (role_key) do update
set label = excluded.label,
    is_system = true,
    sort_order = excluded.sort_order;

create table if not exists public.project_participants (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.customer_projects(id) on update cascade on delete restrict,
  role_id uuid not null references public.project_participant_roles(id) on update cascade on delete restrict,
  employee_id uuid null references public.hr_employees(id) on update cascade on delete restrict,
  customer_contact_id uuid null references public.customer_contacts(id) on update cascade on delete restrict,
  profile_id uuid null references public.profiles(id) on update cascade on delete restrict,
  source text not null default 'manual' check (source in ('manual', 'project_sales_rep')),
  is_active boolean not null default true,
  started_at timestamptz not null default now(),
  ended_at timestamptz null,
  notes text null,
  created_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid null references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint project_participants_one_subject check (num_nonnulls(employee_id, customer_contact_id, profile_id) = 1),
  constraint project_participants_source_shape check (
    source <> 'project_sales_rep' or (profile_id is not null and employee_id is null and customer_contact_id is null)
  ),
  unique (id, project_id)
);

create unique index if not exists project_participants_sales_rep_projection_uq
  on public.project_participants(project_id, role_id)
  where source = 'project_sales_rep' and is_active;
create unique index if not exists project_participants_manual_employee_uq
  on public.project_participants(project_id, role_id, employee_id)
  where source = 'manual' and employee_id is not null and is_active;
create unique index if not exists project_participants_manual_contact_uq
  on public.project_participants(project_id, role_id, customer_contact_id)
  where source = 'manual' and customer_contact_id is not null and is_active;
create unique index if not exists project_participants_manual_profile_uq
  on public.project_participants(project_id, role_id, profile_id)
  where source = 'manual' and profile_id is not null and is_active;

create table if not exists public.project_commission_obligations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.customer_projects(id) on update cascade on delete restrict,
  participant_id uuid not null,
  order_id uuid null references public.customer_orders(id) on update cascade on delete restrict,
  scope_type text not null default 'project' check (scope_type in ('project', 'category', 'product')),
  product_category_id uuid null references public.product_categories(id) on update cascade on delete restrict,
  product_id uuid null references public.products(id) on update cascade on delete restrict,
  basis_type text not null check (basis_type in ('fixed', 'percentage')),
  basis_amount numeric(18,2) null,
  rate numeric(9,4) null,
  flat_amount numeric(18,2) null,
  currency_code varchar(3) not null check (currency_code = upper(currency_code) and currency_code ~ '^[A-Z]{3}$'),
  base_amount numeric(18,2) generated always as (
    case
      when basis_type = 'fixed' then flat_amount
      else round((basis_amount * rate) / 100.0, 2)
    end
  ) stored,
  description text null,
  created_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint project_commission_obligation_participant_fk
    foreign key (participant_id, project_id) references public.project_participants(id, project_id) on update cascade on delete restrict,
  constraint project_commission_scope_shape check (
    (scope_type = 'project' and product_category_id is null and product_id is null)
    or (scope_type = 'category' and product_category_id is not null and product_id is null)
    or (scope_type = 'product' and product_id is not null)
  ),
  constraint project_commission_basis_shape check (
    (basis_type = 'fixed' and flat_amount > 0 and basis_amount is null and rate is null)
    or (basis_type = 'percentage' and basis_amount >= 0 and rate > 0 and rate <= 100 and flat_amount is null)
  )
);

create index if not exists project_commission_obligations_project_idx
  on public.project_commission_obligations(project_id, created_at desc);
create index if not exists project_commission_obligations_participant_idx
  on public.project_commission_obligations(participant_id, created_at desc);

create table if not exists public.project_commission_events (
  id uuid primary key default gen_random_uuid(),
  obligation_id uuid not null references public.project_commission_obligations(id) on update cascade on delete restrict,
  event_type text not null check (event_type in ('earned', 'approved', 'cancelled', 'adjustment', 'offset', 'reversal')),
  status_after text not null check (status_after in ('pending', 'earned', 'approved', 'cancelled')),
  amount_delta numeric(18,2) not null default 0,
  reason text null,
  reverses_event_id uuid null references public.project_commission_events(id) on update cascade on delete restrict,
  created_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint project_commission_event_shape check (
    (event_type in ('earned', 'approved', 'cancelled') and amount_delta = 0 and reverses_event_id is null)
    or (event_type = 'adjustment' and amount_delta <> 0 and reverses_event_id is null and length(btrim(coalesce(reason, ''))) > 0)
    or (event_type = 'offset' and amount_delta < 0 and reverses_event_id is null and length(btrim(coalesce(reason, ''))) > 0)
    or (event_type = 'reversal' and amount_delta <> 0 and reverses_event_id is not null and length(btrim(coalesce(reason, ''))) > 0)
  )
);

create index if not exists project_commission_events_obligation_idx
  on public.project_commission_events(obligation_id, created_at, id);
create unique index if not exists project_commission_events_reversal_uq
  on public.project_commission_events(reverses_event_id)
  where reverses_event_id is not null;

create or replace function private.reject_project_commission_history_rewrite()
returns trigger
language plpgsql
set search_path = pg_catalog, public, private
as $$
begin
  raise exception 'PROJECT_COMMISSION_HISTORY_IMMUTABLE: commission obligations/events are append-only';
end;
$$;

create trigger trg_project_commission_obligations_immutable
before update or delete on public.project_commission_obligations
for each row execute function private.reject_project_commission_history_rewrite();

create trigger trg_project_commission_events_immutable
before update or delete on public.project_commission_events
for each row execute function private.reject_project_commission_history_rewrite();

create or replace function private.current_project_commission_status(p_obligation_id uuid)
returns text
language sql
stable
set search_path = pg_catalog, public
as $$
  select coalesce(
    (select e.status_after from public.project_commission_events e
     where e.obligation_id = p_obligation_id
     order by e.created_at desc, e.id desc limit 1),
    'pending'
  );
$$;

create or replace function private.can_view_project_commission(p_project_id uuid, p_participant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select
    public.current_user_has_any_role(array['super_admin','admin','finance'])
    or (
      public.current_user_has_any_role(array['sales'])
      and exists (
        select 1
        from public.project_participants pp
        left join public.hr_employees he on he.id = pp.employee_id
        where pp.id = p_participant_id
          and pp.project_id = p_project_id
          and pp.is_active
          and (pp.profile_id = auth.uid() or he.user_id = auth.uid())
      )
    );
$$;

create or replace function private.sync_project_sales_rep_participant()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_role_id uuid;
begin
  select id into v_role_id from public.project_participant_roles where role_key = 'sales_rep';
  if v_role_id is null then raise exception 'PROJECT_PARTICIPANT_ROLE_MISSING: sales_rep'; end if;

  update public.project_participants
  set is_active = false,
      ended_at = coalesce(ended_at, now()),
      updated_at = now(),
      updated_by = auth.uid()
  where project_id = new.id
    and role_id = v_role_id
    and source = 'project_sales_rep'
    and is_active
    and profile_id is distinct from new.sales_rep_id;

  if new.sales_rep_id is not null and not exists (
    select 1 from public.project_participants
    where project_id = new.id and role_id = v_role_id and source = 'project_sales_rep'
      and is_active and profile_id = new.sales_rep_id
  ) then
    insert into public.project_participants(project_id, role_id, profile_id, source, created_by, updated_by)
    values (new.id, v_role_id, new.sales_rep_id, 'project_sales_rep', auth.uid(), auth.uid());
  end if;
  return new;
end;
$$;

drop trigger if exists trg_customer_projects_pb6_sales_rep_participant on public.customer_projects;
create trigger trg_customer_projects_pb6_sales_rep_participant
after insert or update of sales_rep_id on public.customer_projects
for each row execute function private.sync_project_sales_rep_participant();

insert into public.project_participants(project_id, role_id, profile_id, source, created_by, updated_by)
select cp.id, pr.id, cp.sales_rep_id, 'project_sales_rep', null, null
from public.customer_projects cp
join public.project_participant_roles pr on pr.role_key = 'sales_rep'
where cp.sales_rep_id is not null
  and not exists (
    select 1 from public.project_participants pp
    where pp.project_id = cp.id and pp.role_id = pr.id and pp.source = 'project_sales_rep'
      and pp.is_active and pp.profile_id = cp.sales_rep_id
  );

alter table public.project_participant_roles enable row level security;
alter table public.project_participants enable row level security;
alter table public.project_commission_obligations enable row level security;
alter table public.project_commission_events enable row level security;

create policy project_participant_roles_internal_read on public.project_participant_roles
for select to authenticated
using (public.current_user_has_any_role(array['super_admin','admin','finance','sales']));

create policy project_participants_internal_read on public.project_participants
for select to authenticated
using (public.current_user_has_any_role(array['super_admin','admin','finance','sales']));

create policy project_commission_obligations_bounded_read on public.project_commission_obligations
for select to authenticated
using (private.can_view_project_commission(project_id, participant_id));

create policy project_commission_events_bounded_read on public.project_commission_events
for select to authenticated
using (exists (
  select 1 from public.project_commission_obligations o
  where o.id = obligation_id and private.can_view_project_commission(o.project_id, o.participant_id)
));

create or replace function public.get_customer_project_participants(p_project_id uuid)
returns table(
  id uuid, role_key text, role_label text, subject_type text, subject_id uuid,
  display_name text, is_active boolean, source text, started_at timestamptz, ended_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select
    pp.id, pr.role_key, pr.label,
    case when pp.employee_id is not null then 'employee' when pp.customer_contact_id is not null then 'customer_contact' else 'profile' end,
    coalesce(pp.employee_id, pp.customer_contact_id, pp.profile_id),
    coalesce(
      nullif(btrim(concat_ws(' ', he.first_name, he.last_name)), ''),
      nullif(btrim(cc.first_name || ' ' || cc.last_name), ''),
      nullif(btrim(p.full_name), ''), p.email, 'Unnamed participant'
    ) as display_name,
    pp.is_active, pp.source, pp.started_at, pp.ended_at
  from public.project_participants pp
  join public.project_participant_roles pr on pr.id = pp.role_id
  left join public.hr_employees he on he.id = pp.employee_id
  left join public.customer_contacts cc on cc.id = pp.customer_contact_id
  left join public.profiles p on p.id = pp.profile_id
  where pp.project_id = p_project_id
    and public.current_user_has_any_role(array['super_admin','admin','finance','sales'])
  order by pp.is_active desc, pr.sort_order, display_name;
$$;

create or replace function public.set_customer_project_participant(
  p_project_id uuid,
  p_role_key text,
  p_employee_id uuid default null,
  p_customer_contact_id uuid default null,
  p_profile_id uuid default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare v_role public.project_participant_roles; v_id uuid; v_customer_id uuid;
begin
  if not public.current_user_has_any_role(array['super_admin','admin']) then raise exception 'PROJECT_PARTICIPANT_MANAGE_FORBIDDEN'; end if;
  if num_nonnulls(p_employee_id, p_customer_contact_id, p_profile_id) <> 1 then raise exception 'PROJECT_PARTICIPANT_SUBJECT_REQUIRED'; end if;
  select * into v_role from public.project_participant_roles where role_key = p_role_key and is_active;
  if not found then raise exception 'PROJECT_PARTICIPANT_ROLE_INVALID'; end if;
  if v_role.role_key = 'sales_rep' then raise exception 'PROJECT_SALES_REP_CANONICAL: update customer_projects.sales_rep_id instead'; end if;
  select customer_id into v_customer_id from public.customer_projects where id = p_project_id;
  if v_customer_id is null then raise exception 'PROJECT_NOT_FOUND'; end if;
  if p_customer_contact_id is not null and not exists (select 1 from public.customer_contacts where id = p_customer_contact_id and customer_id = v_customer_id) then
    raise exception 'PROJECT_PARTICIPANT_CONTACT_CUSTOMER_MISMATCH';
  end if;
  insert into public.project_participants(project_id, role_id, employee_id, customer_contact_id, profile_id, notes, created_by, updated_by)
  values (p_project_id, v_role.id, p_employee_id, p_customer_contact_id, p_profile_id, nullif(btrim(p_notes),''), auth.uid(), auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.deactivate_customer_project_participant(p_participant_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if not public.current_user_has_any_role(array['super_admin','admin']) then raise exception 'PROJECT_PARTICIPANT_MANAGE_FORBIDDEN'; end if;
  if exists (select 1 from public.project_participants where id = p_participant_id and source = 'project_sales_rep') then
    raise exception 'PROJECT_SALES_REP_CANONICAL: update customer_projects.sales_rep_id instead';
  end if;
  update public.project_participants set is_active=false, ended_at=coalesce(ended_at,now()), updated_by=auth.uid(), updated_at=now()
  where id=p_participant_id and is_active;
end;
$$;

create or replace function public.create_customer_project_commission_obligation(
  p_project_id uuid,
  p_participant_id uuid,
  p_basis_type text,
  p_currency_code text,
  p_scope_type text default 'project',
  p_basis_amount numeric default null,
  p_rate numeric default null,
  p_flat_amount numeric default null,
  p_order_id uuid default null,
  p_product_category_id uuid default null,
  p_product_id uuid default null,
  p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare v_id uuid;
begin
  if not public.current_user_has_any_role(array['super_admin','admin','finance']) then raise exception 'PROJECT_COMMISSION_MANAGE_FORBIDDEN'; end if;
  if not exists (select 1 from public.project_participants where id=p_participant_id and project_id=p_project_id and is_active) then raise exception 'PROJECT_COMMISSION_PARTICIPANT_INVALID'; end if;
  if p_order_id is not null and not exists (select 1 from public.customer_orders where id=p_order_id and project_id=p_project_id) then raise exception 'PROJECT_COMMISSION_ORDER_PROJECT_MISMATCH'; end if;
  insert into public.project_commission_obligations(
    project_id, participant_id, order_id, scope_type, product_category_id, product_id,
    basis_type, basis_amount, rate, flat_amount, currency_code, description, created_by
  ) values (
    p_project_id, p_participant_id, p_order_id, lower(p_scope_type), p_product_category_id, p_product_id,
    lower(p_basis_type), p_basis_amount, p_rate, p_flat_amount, upper(p_currency_code), nullif(btrim(p_description),''), auth.uid()
  ) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.append_customer_project_commission_event(
  p_obligation_id uuid,
  p_event_type text,
  p_amount_delta numeric default null,
  p_reason text default null,
  p_reverses_event_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare v_status text; v_type text := lower(p_event_type); v_delta numeric(18,2) := coalesce(p_amount_delta,0); v_status_after text; v_target public.project_commission_events; v_id uuid;
begin
  if not public.current_user_has_any_role(array['super_admin','admin','finance']) then raise exception 'PROJECT_COMMISSION_MANAGE_FORBIDDEN'; end if;
  if not exists (select 1 from public.project_commission_obligations where id=p_obligation_id) then raise exception 'PROJECT_COMMISSION_NOT_FOUND'; end if;
  v_status := private.current_project_commission_status(p_obligation_id);
  if v_type = 'earned' then
    if v_status <> 'pending' or p_amount_delta is not null or p_reverses_event_id is not null then raise exception 'PROJECT_COMMISSION_EARN_INVALID_STATE'; end if;
    v_status_after := 'earned'; v_delta := 0;
  elsif v_type = 'approved' then
    if v_status <> 'earned' or p_amount_delta is not null or p_reverses_event_id is not null then raise exception 'PROJECT_COMMISSION_APPROVE_INVALID_STATE'; end if;
    v_status_after := 'approved'; v_delta := 0;
  elsif v_type = 'cancelled' then
    if v_status not in ('pending','earned') or p_amount_delta is not null or p_reverses_event_id is not null or length(btrim(coalesce(p_reason,''))) = 0 then raise exception 'PROJECT_COMMISSION_CANCEL_INVALID_STATE'; end if;
    v_status_after := 'cancelled'; v_delta := 0;
  elsif v_type in ('adjustment','offset') then
    if v_status not in ('earned','approved') or p_amount_delta is null or p_amount_delta = 0 or p_reverses_event_id is not null or length(btrim(coalesce(p_reason,''))) = 0 then raise exception 'PROJECT_COMMISSION_ADJUST_INVALID_STATE'; end if;
    if v_type='offset' and p_amount_delta >= 0 then raise exception 'PROJECT_COMMISSION_OFFSET_MUST_BE_NEGATIVE'; end if;
    v_status_after := 'earned';
  elsif v_type = 'reversal' then
    if v_status not in ('earned','approved') or p_reverses_event_id is null or p_amount_delta is not null or length(btrim(coalesce(p_reason,''))) = 0 then raise exception 'PROJECT_COMMISSION_REVERSAL_INVALID_STATE'; end if;
    select * into v_target from public.project_commission_events where id=p_reverses_event_id and obligation_id=p_obligation_id and event_type in ('adjustment','offset');
    if not found or exists (select 1 from public.project_commission_events where reverses_event_id=p_reverses_event_id) then raise exception 'PROJECT_COMMISSION_REVERSAL_TARGET_INVALID'; end if;
    v_delta := -v_target.amount_delta; v_status_after := 'earned';
  else
    raise exception 'PROJECT_COMMISSION_EVENT_TYPE_INVALID';
  end if;
  insert into public.project_commission_events(obligation_id,event_type,status_after,amount_delta,reason,reverses_event_id,created_by)
  values (p_obligation_id,v_type,v_status_after,v_delta,nullif(btrim(p_reason),''),p_reverses_event_id,auth.uid()) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.get_customer_project_commissions(p_project_id uuid)
returns table(
  obligation_id uuid, participant_id uuid, participant_name text, role_label text,
  scope_type text, basis_type text, basis_amount numeric, rate numeric, flat_amount numeric,
  currency_code text, base_amount numeric, current_amount numeric, status text,
  paid_amount numeric, created_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select
    o.id, o.participant_id,
    coalesce(nullif(btrim(concat_ws(' ',he.first_name,he.last_name)),''), nullif(btrim(cc.first_name || ' ' || cc.last_name),''), nullif(btrim(p.full_name),''), p.email, 'Unnamed participant'),
    pr.label, o.scope_type, o.basis_type, o.basis_amount, o.rate, o.flat_amount,
    o.currency_code::text, o.base_amount,
    o.base_amount + coalesce((select sum(e.amount_delta) from public.project_commission_events e where e.obligation_id=o.id),0),
    private.current_project_commission_status(o.id),
    case when public.current_user_has_any_role(array['super_admin','admin','finance']) then coalesce((
      select sum(l.allocated_amount)
      from public.finance_transaction_links l
      join public.finance_transactions ft on ft.id=l.transaction_id and ft.status='posted'
      where l.source_document_type = 'project_commission_obligation' and l.source_document_id=o.id
    ),0) else null end,
    o.created_at
  from public.project_commission_obligations o
  join public.project_participants pp on pp.id=o.participant_id
  join public.project_participant_roles pr on pr.id=pp.role_id
  left join public.hr_employees he on he.id=pp.employee_id
  left join public.customer_contacts cc on cc.id=pp.customer_contact_id
  left join public.profiles p on p.id=pp.profile_id
  where o.project_id=p_project_id and private.can_view_project_commission(o.project_id,o.participant_id)
  order by o.created_at desc;
$$;

create index if not exists finance_transaction_links_project_commission_idx
  on public.finance_transaction_links(source_document_id, transaction_id)
  where source_document_type = 'project_commission_obligation';

revoke all on public.project_participant_roles, public.project_participants, public.project_commission_obligations, public.project_commission_events from public, anon;
grant select on public.project_participant_roles, public.project_participants, public.project_commission_obligations, public.project_commission_events to authenticated;

revoke all on function public.get_customer_project_participants(uuid) from public;
revoke all on function public.set_customer_project_participant(uuid,text,uuid,uuid,uuid,text) from public;
revoke all on function public.deactivate_customer_project_participant(uuid) from public;
revoke all on function public.create_customer_project_commission_obligation(uuid,uuid,text,text,text,numeric,numeric,numeric,uuid,uuid,uuid,text) from public;
revoke all on function public.append_customer_project_commission_event(uuid,text,numeric,text,uuid) from public;
revoke all on function public.get_customer_project_commissions(uuid) from public;

grant execute on function public.get_customer_project_participants(uuid) to authenticated;
grant execute on function public.set_customer_project_participant(uuid,text,uuid,uuid,uuid,text) to authenticated;
grant execute on function public.deactivate_customer_project_participant(uuid) to authenticated;
grant execute on function public.create_customer_project_commission_obligation(uuid,uuid,text,text,text,numeric,numeric,numeric,uuid,uuid,uuid,text) to authenticated;
grant execute on function public.append_customer_project_commission_event(uuid,text,numeric,text,uuid) to authenticated;
grant execute on function public.get_customer_project_commissions(uuid) to authenticated;