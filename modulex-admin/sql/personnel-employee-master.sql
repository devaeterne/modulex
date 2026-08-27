create sequence if not exists public.employee_number_seq start with 1001;

create table if not exists public.hr_departments (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null unique,
  description text,
  is_active boolean not null default true,
  sort_order integer not null default 100,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hr_departments_code_not_blank check (length(trim(code)) > 0),
  constraint hr_departments_name_not_blank check (length(trim(name)) > 0)
);

create table if not exists public.hr_positions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null,
  department_id uuid references public.hr_departments(id) on delete set null,
  description text,
  is_active boolean not null default true,
  sort_order integer not null default 100,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hr_positions_code_not_blank check (length(trim(code)) > 0),
  constraint hr_positions_title_not_blank check (length(trim(title)) > 0)
);

create table if not exists public.hr_employees (
  id uuid primary key default gen_random_uuid(),
  employee_number text not null unique default ('EMP-' || lpad(nextval('public.employee_number_seq')::text, 6, '0')),
  user_id uuid unique references public.profiles(id) on delete set null,
  first_name text not null,
  last_name text not null,
  preferred_name text,
  work_email text,
  personal_email text,
  phone text,
  date_of_birth date,
  department_id uuid references public.hr_departments(id) on delete set null,
  position_id uuid references public.hr_positions(id) on delete set null,
  manager_id uuid references public.hr_employees(id) on delete set null,
  employment_status text not null default 'active',
  employment_type text not null default 'full_time',
  hire_date date,
  termination_date date,
  termination_reason text,
  work_location text,
  address_line1 text,
  address_line2 text,
  city text,
  state_region text,
  postal_code text,
  country text not null default 'United States',
  notes text,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hr_employees_first_name_not_blank check (length(trim(first_name)) > 0),
  constraint hr_employees_last_name_not_blank check (length(trim(last_name)) > 0),
  constraint hr_employees_status_check check (employment_status in ('active','on_leave','inactive','terminated')),
  constraint hr_employees_type_check check (employment_type in ('full_time','part_time','contractor','temporary','intern')),
  constraint hr_employees_dates_check check (termination_date is null or hire_date is null or termination_date >= hire_date),
  constraint hr_employees_manager_not_self check (manager_id is null or manager_id <> id)
);

create unique index if not exists hr_employees_work_email_unique on public.hr_employees (lower(work_email)) where work_email is not null;
create index if not exists hr_employees_status_idx on public.hr_employees (employment_status);
create index if not exists hr_employees_department_idx on public.hr_employees (department_id);
create index if not exists hr_employees_position_idx on public.hr_employees (position_id);
create index if not exists hr_employees_manager_idx on public.hr_employees (manager_id);
create index if not exists hr_positions_department_idx on public.hr_positions (department_id);

create table if not exists public.hr_employee_history (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  event_type text not null,
  old_values jsonb,
  new_values jsonb,
  changed_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists hr_employee_history_employee_idx on public.hr_employee_history (employee_id, created_at desc);

alter table public.hr_departments enable row level security;
alter table public.hr_positions enable row level security;
alter table public.hr_employees enable row level security;
alter table public.hr_employee_history enable row level security;

drop policy if exists hr_departments_select on public.hr_departments;
create policy hr_departments_select on public.hr_departments for select to authenticated
using (public.current_user_has_any_role(array['super_admin','admin','hr']));
drop policy if exists hr_departments_write on public.hr_departments;
create policy hr_departments_write on public.hr_departments for all to authenticated
using (public.current_user_has_any_role(array['super_admin','admin','hr']))
with check (public.current_user_has_any_role(array['super_admin','admin','hr']));

drop policy if exists hr_positions_select on public.hr_positions;
create policy hr_positions_select on public.hr_positions for select to authenticated
using (public.current_user_has_any_role(array['super_admin','admin','hr']));
drop policy if exists hr_positions_write on public.hr_positions;
create policy hr_positions_write on public.hr_positions for all to authenticated
using (public.current_user_has_any_role(array['super_admin','admin','hr']))
with check (public.current_user_has_any_role(array['super_admin','admin','hr']));

drop policy if exists hr_employees_select on public.hr_employees;
create policy hr_employees_select on public.hr_employees for select to authenticated
using (public.current_user_has_any_role(array['super_admin','admin','hr']));
drop policy if exists hr_employees_write on public.hr_employees;
create policy hr_employees_write on public.hr_employees for all to authenticated
using (public.current_user_has_any_role(array['super_admin','admin','hr']))
with check (public.current_user_has_any_role(array['super_admin','admin','hr']));

drop policy if exists hr_employee_history_select on public.hr_employee_history;
create policy hr_employee_history_select on public.hr_employee_history for select to authenticated
using (public.current_user_has_any_role(array['super_admin','admin','hr']));

grant select, insert, update, delete on public.hr_departments to authenticated;
grant select, insert, update, delete on public.hr_positions to authenticated;
grant select, insert, update, delete on public.hr_employees to authenticated;
grant select on public.hr_employee_history to authenticated;
grant usage, select on sequence public.employee_number_seq to authenticated;

create or replace function private.log_hr_employee_change()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
begin
  if tg_op = 'INSERT' then
    insert into public.hr_employee_history(employee_id, event_type, old_values, new_values, changed_by)
    values (new.id, 'created', null, to_jsonb(new), auth.uid());
    return new;
  end if;

  if row(old.employment_status, old.employment_type, old.department_id, old.position_id, old.manager_id, old.hire_date, old.termination_date)
     is distinct from
     row(new.employment_status, new.employment_type, new.department_id, new.position_id, new.manager_id, new.hire_date, new.termination_date) then
    insert into public.hr_employee_history(employee_id, event_type, old_values, new_values, changed_by)
    values (
      new.id,
      'employment_changed',
      jsonb_build_object(
        'employment_status', old.employment_status,
        'employment_type', old.employment_type,
        'department_id', old.department_id,
        'position_id', old.position_id,
        'manager_id', old.manager_id,
        'hire_date', old.hire_date,
        'termination_date', old.termination_date
      ),
      jsonb_build_object(
        'employment_status', new.employment_status,
        'employment_type', new.employment_type,
        'department_id', new.department_id,
        'position_id', new.position_id,
        'manager_id', new.manager_id,
        'hire_date', new.hire_date,
        'termination_date', new.termination_date
      ),
      auth.uid()
    );
  end if;
  return new;
end;
$function$;

revoke all on function private.log_hr_employee_change() from public;

drop trigger if exists trg_hr_departments_updated_at on public.hr_departments;
create trigger trg_hr_departments_updated_at before update on public.hr_departments for each row execute function public.set_updated_at();
drop trigger if exists trg_hr_positions_updated_at on public.hr_positions;
create trigger trg_hr_positions_updated_at before update on public.hr_positions for each row execute function public.set_updated_at();
drop trigger if exists trg_hr_employees_updated_at on public.hr_employees;
create trigger trg_hr_employees_updated_at before update on public.hr_employees for each row execute function public.set_updated_at();
drop trigger if exists trg_hr_employee_history on public.hr_employees;
create trigger trg_hr_employee_history after insert or update on public.hr_employees for each row execute function private.log_hr_employee_change();
