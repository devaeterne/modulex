-- PB-6 integrity: participant subjects must be active/canonical and commission corrections cannot create negative entitlement.

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
declare
  v_role public.project_participant_roles;
  v_id uuid;
  v_customer_id uuid;
begin
  if not public.current_user_has_any_role(array['super_admin','admin']) then
    raise exception 'PROJECT_PARTICIPANT_MANAGE_FORBIDDEN';
  end if;
  if num_nonnulls(p_employee_id, p_customer_contact_id, p_profile_id) <> 1 then
    raise exception 'PROJECT_PARTICIPANT_SUBJECT_REQUIRED';
  end if;

  select * into v_role
  from public.project_participant_roles
  where role_key = lower(btrim(coalesce(p_role_key, '')))
    and is_active;
  if not found then raise exception 'PROJECT_PARTICIPANT_ROLE_INVALID'; end if;
  if v_role.role_key = 'sales_rep' then
    raise exception 'PROJECT_SALES_REP_CANONICAL: update customer_projects.sales_rep_id instead';
  end if;

  select customer_id into v_customer_id
  from public.customer_projects
  where id = p_project_id;
  if v_customer_id is null then raise exception 'PROJECT_NOT_FOUND'; end if;

  if p_employee_id is not null and not exists (
    select 1 from public.hr_employees
    where id = p_employee_id and employment_status = 'active'
  ) then
    raise exception 'PROJECT_PARTICIPANT_EMPLOYEE_INACTIVE_OR_MISSING';
  end if;

  if p_customer_contact_id is not null and not exists (
    select 1 from public.customer_contacts
    where id = p_customer_contact_id
      and customer_id = v_customer_id
      and is_active
  ) then
    raise exception 'PROJECT_PARTICIPANT_CONTACT_CUSTOMER_MISMATCH_OR_INACTIVE';
  end if;

  if p_profile_id is not null and not exists (
    select 1 from public.profiles
    where id = p_profile_id and is_active
  ) then
    raise exception 'PROJECT_PARTICIPANT_PROFILE_INACTIVE_OR_MISSING';
  end if;

  insert into public.project_participants(
    project_id, role_id, employee_id, customer_contact_id, profile_id,
    notes, created_by, updated_by
  ) values (
    p_project_id, v_role.id, p_employee_id, p_customer_contact_id, p_profile_id,
    nullif(btrim(p_notes), ''), auth.uid(), auth.uid()
  )
  returning id into v_id;

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
declare
  v_status text;
  v_type text := lower(btrim(coalesce(p_event_type, '')));
  v_delta numeric(18,2) := coalesce(p_amount_delta, 0);
  v_status_after text;
  v_target public.project_commission_events;
  v_current_amount numeric(18,2);
  v_id uuid;
begin
  if not public.current_user_has_any_role(array['super_admin','admin','finance']) then
    raise exception 'PROJECT_COMMISSION_MANAGE_FORBIDDEN';
  end if;

  select
    o.base_amount + coalesce((
      select sum(e.amount_delta)
      from public.project_commission_events e
      where e.obligation_id = o.id
    ), 0)
  into v_current_amount
  from public.project_commission_obligations o
  where o.id = p_obligation_id;

  if not found then raise exception 'PROJECT_COMMISSION_NOT_FOUND'; end if;
  v_status := private.current_project_commission_status(p_obligation_id);

  if v_type = 'earned' then
    if v_status <> 'pending' or p_amount_delta is not null or p_reverses_event_id is not null then
      raise exception 'PROJECT_COMMISSION_EARN_INVALID_STATE';
    end if;
    v_status_after := 'earned';
    v_delta := 0;
  elsif v_type = 'approved' then
    if v_status <> 'earned' or p_amount_delta is not null or p_reverses_event_id is not null then
      raise exception 'PROJECT_COMMISSION_APPROVE_INVALID_STATE';
    end if;
    v_status_after := 'approved';
    v_delta := 0;
  elsif v_type = 'cancelled' then
    if v_status not in ('pending','earned')
       or p_amount_delta is not null
       or p_reverses_event_id is not null
       or length(btrim(coalesce(p_reason, ''))) = 0
    then
      raise exception 'PROJECT_COMMISSION_CANCEL_INVALID_STATE';
    end if;
    v_status_after := 'cancelled';
    v_delta := 0;
  elsif v_type in ('adjustment','offset') then
    if v_status not in ('earned','approved')
       or p_amount_delta is null
       or p_amount_delta = 0
       or p_reverses_event_id is not null
       or length(btrim(coalesce(p_reason, ''))) = 0
    then
      raise exception 'PROJECT_COMMISSION_ADJUST_INVALID_STATE';
    end if;
    if v_type = 'offset' and p_amount_delta >= 0 then
      raise exception 'PROJECT_COMMISSION_OFFSET_MUST_BE_NEGATIVE';
    end if;
    v_status_after := 'earned';
  elsif v_type = 'reversal' then
    if v_status not in ('earned','approved')
       or p_reverses_event_id is null
       or p_amount_delta is not null
       or length(btrim(coalesce(p_reason, ''))) = 0
    then
      raise exception 'PROJECT_COMMISSION_REVERSAL_INVALID_STATE';
    end if;
    select * into v_target
    from public.project_commission_events
    where id = p_reverses_event_id
      and obligation_id = p_obligation_id
      and event_type in ('adjustment','offset');
    if not found or exists (
      select 1 from public.project_commission_events where reverses_event_id = p_reverses_event_id
    ) then
      raise exception 'PROJECT_COMMISSION_REVERSAL_TARGET_INVALID';
    end if;
    v_delta := -v_target.amount_delta;
    v_status_after := 'earned';
  else
    raise exception 'PROJECT_COMMISSION_EVENT_TYPE_INVALID';
  end if;

  if v_current_amount + v_delta < 0 then
    raise exception 'PROJECT_COMMISSION_NEGATIVE_ENTITLEMENT';
  end if;

  insert into public.project_commission_events(
    obligation_id, event_type, status_after, amount_delta, reason, reverses_event_id, created_by
  ) values (
    p_obligation_id, v_type, v_status_after, v_delta,
    nullif(btrim(p_reason), ''), p_reverses_event_id, auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.set_customer_project_participant(uuid,text,uuid,uuid,uuid,text) from public;
revoke all on function public.append_customer_project_commission_event(uuid,text,numeric,text,uuid) from public;
grant execute on function public.set_customer_project_participant(uuid,text,uuid,uuid,uuid,text) to authenticated;
grant execute on function public.append_customer_project_commission_event(uuid,text,numeric,text,uuid) to authenticated;
