create sequence if not exists public.customer_project_proposal_number_seq;

create table if not exists public.proposal_area_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_key text not null unique,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint proposal_area_types_name_required check (btrim(name) <> ''),
  constraint proposal_area_types_key_required check (normalized_key ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$')
);

create table if not exists public.customer_project_proposals (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.customer_projects(id) on delete restrict,
  proposal_number text not null default (
    'PROP-' || to_char(current_date, 'YYYY') || '-' ||
    lpad(nextval('public.customer_project_proposal_number_seq'::regclass)::text, 6, '0')
  ),
  status text not null default 'draft',
  create_idempotency_key uuid,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_project_proposals_number_unique unique (proposal_number),
  constraint customer_project_proposals_status_check check (status in ('draft','sent','accepted','rejected','superseded'))
);

create unique index if not exists customer_project_proposals_project_create_key_uidx
  on public.customer_project_proposals(project_id, create_idempotency_key)
  where create_idempotency_key is not null;
create index if not exists customer_project_proposals_project_created_idx
  on public.customer_project_proposals(project_id, created_at desc);

create table if not exists public.customer_project_proposal_revisions (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.customer_project_proposals(id) on delete restrict,
  revision_no integer not null,
  state text not null default 'draft',
  currency_code varchar(3) not null default 'USD',
  valid_until date,
  customer_message text,
  terms_text text,
  revision_note text,
  create_idempotency_key uuid,
  sent_at timestamptz,
  sent_by uuid references public.profiles(id) on delete set null,
  rejected_at timestamptz,
  rejected_by uuid references public.profiles(id) on delete set null,
  rejection_note text,
  accepted_at timestamptz,
  accepted_by uuid references public.profiles(id) on delete set null,
  superseded_at timestamptz,
  superseded_by uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_project_proposal_revisions_number_positive check (revision_no > 0),
  constraint customer_project_proposal_revisions_state_check check (state in ('draft','sent','accepted','rejected','superseded')),
  constraint customer_project_proposal_revisions_currency_check check (currency_code ~ '^[A-Z]{3}$'),
  constraint customer_project_proposal_revisions_number_unique unique (proposal_id, revision_no)
);

create unique index if not exists customer_project_proposal_revisions_draft_uidx
  on public.customer_project_proposal_revisions(proposal_id)
  where state = 'draft';
create unique index if not exists customer_project_proposal_revisions_accepted_uidx
  on public.customer_project_proposal_revisions(proposal_id)
  where state = 'accepted';
create unique index if not exists customer_project_proposal_revisions_create_key_uidx
  on public.customer_project_proposal_revisions(proposal_id, create_idempotency_key)
  where create_idempotency_key is not null;
create index if not exists customer_project_proposal_revisions_proposal_number_idx
  on public.customer_project_proposal_revisions(proposal_id, revision_no desc);

create table if not exists public.customer_project_proposal_pricing_groups (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null references public.customer_project_proposal_revisions(id) on delete restrict,
  label text not null,
  description text,
  sell_amount numeric(18,2) not null,
  sort_order integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_project_proposal_pricing_groups_label_required check (btrim(label) <> ''),
  constraint customer_project_proposal_pricing_groups_sell_nonnegative check (sell_amount >= 0),
  constraint customer_project_proposal_pricing_groups_revision_id_id_unique unique (revision_id, id)
);

create index if not exists customer_project_proposal_pricing_groups_revision_sort_idx
  on public.customer_project_proposal_pricing_groups(revision_id, sort_order, created_at);

create table if not exists public.customer_project_proposal_areas (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null references public.customer_project_proposal_revisions(id) on delete restrict,
  area_type_id uuid null references public.proposal_area_types(id) on delete restrict,
  area_name text not null,
  readiness_status text null,
  status_note text null,
  material_product_id uuid null references public.products(id) on delete set null,
  material_description text null,
  supplier_snapshot text null,
  finish text null,
  thickness text null,
  sq_ft numeric(18,4) null,
  linear_ft numeric(18,4) null,
  edge_profile text null,
  edge_linear_ft numeric(18,4) null,
  sink_quantity integer null,
  sink_source text null,
  sink_cutout_quantity integer null,
  sink_template_status text null,
  backsplash text null,
  backsplash_notes text null,
  scope_notes text null,
  measurement_notes text null,
  internal_notes text null,
  pricing_group_id uuid null,
  direct_sell_amount numeric(18,2) null,
  sort_order integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_project_proposal_areas_name_required check (btrim(area_name) <> ''),
  constraint customer_project_proposal_areas_readiness_check check (
    readiness_status is null or readiness_status in ('not_ready','ready_to_measure','needs_remeasure','ready_to_cut')
  ),
  constraint customer_project_proposal_areas_sq_ft_nonnegative check (sq_ft is null or sq_ft >= 0),
  constraint customer_project_proposal_areas_linear_ft_nonnegative check (linear_ft is null or linear_ft >= 0),
  constraint customer_project_proposal_areas_edge_linear_ft_nonnegative check (edge_linear_ft is null or edge_linear_ft >= 0),
  constraint customer_project_proposal_areas_sink_quantity_nonnegative check (sink_quantity is null or sink_quantity >= 0),
  constraint customer_project_proposal_areas_sink_cutout_quantity_nonnegative check (sink_cutout_quantity is null or sink_cutout_quantity >= 0),
  constraint customer_project_proposal_areas_direct_sell_nonnegative check (direct_sell_amount is null or direct_sell_amount >= 0),
  constraint customer_project_proposal_areas_direct_or_group_check check (
    not (direct_sell_amount is not null and pricing_group_id is not null)
  ),
  constraint customer_project_proposal_areas_pricing_group_revision_fk
    foreign key (revision_id, pricing_group_id)
    references public.customer_project_proposal_pricing_groups(revision_id, id)
    on delete restrict
);

create index if not exists customer_project_proposal_areas_revision_sort_idx
  on public.customer_project_proposal_areas(revision_id, sort_order, created_at);
create index if not exists customer_project_proposal_areas_pricing_group_idx
  on public.customer_project_proposal_areas(pricing_group_id)
  where pricing_group_id is not null;

create table if not exists public.customer_project_proposal_acceptances (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null references public.customer_project_proposal_revisions(id) on delete restrict,
  accepted_name text not null,
  accepted_email text null,
  accepted_at timestamptz not null default now(),
  acceptance_method text not null,
  signature_text text null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint customer_project_proposal_acceptances_revision_unique unique (revision_id),
  constraint customer_project_proposal_acceptances_name_required check (btrim(accepted_name) <> ''),
  constraint customer_project_proposal_acceptances_method_required check (btrim(acceptance_method) <> '')
);

insert into public.proposal_area_types(name, normalized_key, sort_order)
values
  ('Kitchen','kitchen',10),
  ('Kitchen Island','kitchen_island',20),
  ('Bathroom','bathroom',30),
  ('Master Bathroom','master_bathroom',40),
  ('Powder Room','powder_room',50),
  ('Laundry','laundry',60),
  ('Wet Bar','wet_bar',70),
  ('Bar','bar',80),
  ('Pantry','pantry',90),
  ('Fireplace','fireplace',100),
  ('Outdoor Kitchen','outdoor_kitchen',110),
  ('Pool House','pool_house',120),
  ('Garage','garage',130),
  ('Basement','basement',140),
  ('Office','office',150),
  ('Other','other',160)
on conflict (normalized_key) do nothing;

create or replace function private.can_view_project_proposals()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select auth.uid() is not null
    and public.current_user_has_any_role(array['super_admin','admin','sales','finance']::text[]);
$$;

create or replace function private.can_manage_project_proposals()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select auth.uid() is not null
    and public.current_user_has_any_role(array['super_admin','admin','sales']::text[]);
$$;

create or replace function private.customer_project_proposal_total(p_revision_id uuid)
returns numeric(18,2)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select round(
    coalesce((
      select sum(a.direct_sell_amount)
      from public.customer_project_proposal_areas a
      where a.revision_id = p_revision_id
        and a.pricing_group_id is null
    ), 0)
    +
    coalesce((
      select sum(g.sell_amount)
      from public.customer_project_proposal_pricing_groups g
      where g.revision_id = p_revision_id
    ), 0),
    2
  )::numeric(18,2);
$$;

create or replace function private.guard_customer_project_proposal_revision()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE' then
    if old.state <> 'draft' then
      raise exception 'PROPOSAL_REVISION_IMMUTABLE';
    end if;
    return old;
  end if;

  if old.state <> 'draft' and (
    new.proposal_id is distinct from old.proposal_id
    or new.revision_no is distinct from old.revision_no
    or new.currency_code is distinct from old.currency_code
    or new.valid_until is distinct from old.valid_until
    or new.customer_message is distinct from old.customer_message
    or new.terms_text is distinct from old.terms_text
    or new.revision_note is distinct from old.revision_note
    or new.create_idempotency_key is distinct from old.create_idempotency_key
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'PROPOSAL_REVISION_IMMUTABLE';
  end if;

  if old.state = 'accepted' and new.state <> 'accepted' then
    raise exception 'PROPOSAL_REVISION_IMMUTABLE';
  end if;
  if old.state in ('rejected','superseded') and new.state <> old.state then
    raise exception 'PROPOSAL_REVISION_IMMUTABLE';
  end if;
  if old.state = 'sent' and new.state not in ('sent','accepted','rejected','superseded') then
    raise exception 'PROPOSAL_REVISION_IMMUTABLE';
  end if;
  if old.state = 'draft' and new.state not in ('draft','sent','superseded') then
    raise exception 'PROPOSAL_REVISION_IMMUTABLE';
  end if;

  return new;
end;
$$;

create or replace function private.guard_customer_project_proposal_pricing_group()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_revision_id uuid;
  v_state text;
begin
  v_revision_id := case when tg_op = 'DELETE' then old.revision_id else new.revision_id end;
  select r.state into v_state
  from public.customer_project_proposal_revisions r
  where r.id = v_revision_id;

  if v_state is null then
    raise exception 'PROPOSAL_REVISION_NOT_FOUND';
  end if;
  if v_state <> 'draft' then
    raise exception 'PROPOSAL_REVISION_IMMUTABLE';
  end if;
  if tg_op = 'UPDATE' and new.revision_id is distinct from old.revision_id then
    raise exception 'PROPOSAL_PRICING_GROUP_REVISION_MISMATCH';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function private.guard_customer_project_proposal_area()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_revision_id uuid;
  v_state text;
  v_group_revision_id uuid;
begin
  v_revision_id := case when tg_op = 'DELETE' then old.revision_id else new.revision_id end;
  select r.state into v_state
  from public.customer_project_proposal_revisions r
  where r.id = v_revision_id;

  if v_state is null then
    raise exception 'PROPOSAL_REVISION_NOT_FOUND';
  end if;
  if v_state <> 'draft' then
    raise exception 'PROPOSAL_REVISION_IMMUTABLE';
  end if;
  if tg_op = 'UPDATE' and new.revision_id is distinct from old.revision_id then
    raise exception 'PROPOSAL_AREA_REVISION_MISMATCH';
  end if;

  if tg_op <> 'DELETE' and new.pricing_group_id is not null then
    select g.revision_id into v_group_revision_id
    from public.customer_project_proposal_pricing_groups g
    where g.id = new.pricing_group_id;
    if v_group_revision_id is null or v_group_revision_id is distinct from new.revision_id then
      raise exception 'PROPOSAL_PRICING_GROUP_REVISION_MISMATCH';
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function private.reject_customer_project_proposal_acceptance_rewrite()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  raise exception 'PROPOSAL_ACCEPTANCE_APPEND_ONLY';
end;
$$;

drop trigger if exists guard_customer_project_proposal_revision on public.customer_project_proposal_revisions;
create trigger guard_customer_project_proposal_revision
before update or delete on public.customer_project_proposal_revisions
for each row execute function private.guard_customer_project_proposal_revision();

drop trigger if exists guard_customer_project_proposal_pricing_group on public.customer_project_proposal_pricing_groups;
create trigger guard_customer_project_proposal_pricing_group
before insert or update or delete on public.customer_project_proposal_pricing_groups
for each row execute function private.guard_customer_project_proposal_pricing_group();

drop trigger if exists guard_customer_project_proposal_area on public.customer_project_proposal_areas;
create trigger guard_customer_project_proposal_area
before insert or update or delete on public.customer_project_proposal_areas
for each row execute function private.guard_customer_project_proposal_area();

drop trigger if exists reject_customer_project_proposal_acceptance_update on public.customer_project_proposal_acceptances;
create trigger reject_customer_project_proposal_acceptance_update
before update or delete on public.customer_project_proposal_acceptances
for each row execute function private.reject_customer_project_proposal_acceptance_rewrite();

create or replace function public.get_proposal_area_types(p_include_inactive boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_result jsonb;
begin
  if not private.can_view_project_proposals() then
    raise exception 'PROJECT_PROPOSAL_VIEW_FORBIDDEN' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id,
    'name', t.name,
    'normalized_key', t.normalized_key,
    'is_active', t.is_active,
    'sort_order', t.sort_order
  ) order by t.sort_order, t.name), '[]'::jsonb)
  into v_result
  from public.proposal_area_types t
  where p_include_inactive or t.is_active;

  return v_result;
end;
$$;

create or replace function public.get_project_proposals(p_project_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_result jsonb;
begin
  if not private.can_view_project_proposals() then
    raise exception 'PROJECT_PROPOSAL_VIEW_FORBIDDEN' using errcode = '42501';
  end if;
  if not exists (select 1 from public.customer_projects p where p.id = p_project_id) then
    raise exception 'PROJECT_NOT_FOUND';
  end if;

  select coalesce(jsonb_agg(row_json order by created_at desc, proposal_number desc), '[]'::jsonb)
  into v_result
  from (
    select
      p.created_at,
      p.proposal_number,
      jsonb_build_object(
        'id', p.id,
        'project_id', p.project_id,
        'proposal_number', p.proposal_number,
        'status', p.status,
        'created_at', p.created_at,
        'updated_at', p.updated_at,
        'latest_revision', case when r.id is null then null else jsonb_build_object(
          'id', r.id,
          'revision_no', r.revision_no,
          'state', r.state,
          'currency_code', r.currency_code,
          'valid_until', r.valid_until,
          'proposal_total', private.customer_project_proposal_total(r.id)
        ) end
      ) as row_json
    from public.customer_project_proposals p
    left join lateral (
      select r0.*
      from public.customer_project_proposal_revisions r0
      where r0.proposal_id = p.id
      order by r0.revision_no desc
      limit 1
    ) r on true
    where p.project_id = p_project_id
  ) q;

  return v_result;
end;
$$;

create or replace function public.get_project_proposal(p_proposal_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_proposal public.customer_project_proposals%rowtype;
  v_result jsonb;
begin
  if not private.can_view_project_proposals() then
    raise exception 'PROJECT_PROPOSAL_VIEW_FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_proposal
  from public.customer_project_proposals p
  where p.id = p_proposal_id;
  if not found then
    raise exception 'PROJECT_PROPOSAL_NOT_FOUND';
  end if;

  select jsonb_build_object(
    'id', v_proposal.id,
    'project_id', v_proposal.project_id,
    'proposal_number', v_proposal.proposal_number,
    'status', v_proposal.status,
    'created_at', v_proposal.created_at,
    'updated_at', v_proposal.updated_at,
    'current_revision_id', (
      select r.id from public.customer_project_proposal_revisions r
      where r.proposal_id = v_proposal.id
      order by r.revision_no desc limit 1
    ),
    'revisions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id,
        'revision_no', r.revision_no,
        'state', r.state,
        'currency_code', r.currency_code,
        'valid_until', r.valid_until,
        'customer_message', r.customer_message,
        'terms_text', r.terms_text,
        'revision_note', r.revision_note,
        'sent_at', r.sent_at,
        'rejected_at', r.rejected_at,
        'rejection_note', r.rejection_note,
        'accepted_at', r.accepted_at,
        'superseded_at', r.superseded_at,
        'created_at', r.created_at,
        'updated_at', r.updated_at,
        'proposal_total', private.customer_project_proposal_total(r.id),
        'pricing_groups', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', g.id,
            'label', g.label,
            'description', g.description,
            'sell_amount', g.sell_amount,
            'sort_order', g.sort_order
          ) order by g.sort_order, g.created_at, g.id)
          from public.customer_project_proposal_pricing_groups g
          where g.revision_id = r.id
        ), '[]'::jsonb),
        'areas', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', a.id,
            'area_type_id', a.area_type_id,
            'area_type_name', t.name,
            'area_name', a.area_name,
            'readiness_status', a.readiness_status,
            'status_note', a.status_note,
            'material_product_id', a.material_product_id,
            'material_description', a.material_description,
            'supplier_snapshot', a.supplier_snapshot,
            'finish', a.finish,
            'thickness', a.thickness,
            'sq_ft', a.sq_ft,
            'linear_ft', a.linear_ft,
            'edge_profile', a.edge_profile,
            'edge_linear_ft', a.edge_linear_ft,
            'sink_quantity', a.sink_quantity,
            'sink_source', a.sink_source,
            'sink_cutout_quantity', a.sink_cutout_quantity,
            'sink_template_status', a.sink_template_status,
            'backsplash', a.backsplash,
            'backsplash_notes', a.backsplash_notes,
            'scope_notes', a.scope_notes,
            'measurement_notes', a.measurement_notes,
            'internal_notes', a.internal_notes,
            'pricing_group_id', a.pricing_group_id,
            'direct_sell_amount', a.direct_sell_amount,
            'sort_order', a.sort_order
          ) order by a.sort_order, a.created_at, a.id)
          from public.customer_project_proposal_areas a
          left join public.proposal_area_types t on t.id = a.area_type_id
          where a.revision_id = r.id
        ), '[]'::jsonb),
        'acceptance', (
          select jsonb_build_object(
            'id', ac.id,
            'accepted_name', ac.accepted_name,
            'accepted_email', ac.accepted_email,
            'accepted_at', ac.accepted_at,
            'acceptance_method', ac.acceptance_method,
            'signature_text', ac.signature_text
          )
          from public.customer_project_proposal_acceptances ac
          where ac.revision_id = r.id
        )
      ) order by r.revision_no desc)
      from public.customer_project_proposal_revisions r
      where r.proposal_id = v_proposal.id
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

create or replace function public.create_project_proposal(
  p_project_id uuid,
  p_idempotency_key uuid,
  p_currency_code text default 'USD',
  p_valid_until date default null,
  p_customer_message text default null,
  p_terms_text text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_proposal_id uuid;
  v_currency text;
begin
  if not private.can_manage_project_proposals() then
    raise exception 'PROJECT_PROPOSAL_MANAGE_FORBIDDEN' using errcode = '42501';
  end if;
  if p_project_id is null or not exists (select 1 from public.customer_projects p where p.id = p_project_id) then
    raise exception 'PROJECT_NOT_FOUND';
  end if;
  if p_idempotency_key is null then
    raise exception 'PROPOSAL_IDEMPOTENCY_KEY_REQUIRED';
  end if;

  v_currency := upper(btrim(coalesce(p_currency_code, '')));
  if v_currency !~ '^[A-Z]{3}$' then
    raise exception 'PROPOSAL_CURRENCY_INVALID';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('project-proposal:' || p_project_id::text, 0));

  select p.id into v_proposal_id
  from public.customer_project_proposals p
  where p.project_id = p_project_id
    and p.create_idempotency_key = p_idempotency_key;
  if found then
    return v_proposal_id;
  end if;

  insert into public.customer_project_proposals(
    project_id, status, create_idempotency_key, created_by, updated_by
  ) values (
    p_project_id, 'draft', p_idempotency_key, auth.uid(), auth.uid()
  ) returning id into v_proposal_id;

  insert into public.customer_project_proposal_revisions(
    proposal_id, revision_no, state, currency_code, valid_until,
    customer_message, terms_text, created_by, updated_by
  ) values (
    v_proposal_id, 1, 'draft', v_currency, p_valid_until,
    nullif(btrim(coalesce(p_customer_message, '')), ''),
    nullif(btrim(coalesce(p_terms_text, '')), ''),
    auth.uid(), auth.uid()
  );

  return v_proposal_id;
end;
$$;

create or replace function public.create_project_proposal_revision(
  p_proposal_id uuid,
  p_idempotency_key uuid,
  p_revision_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_proposal public.customer_project_proposals%rowtype;
  v_source public.customer_project_proposal_revisions%rowtype;
  v_revision_id uuid;
  v_revision_no integer;
  v_group record;
  v_area record;
  v_new_group_id uuid;
  v_group_map jsonb := '{}'::jsonb;
begin
  if not private.can_manage_project_proposals() then
    raise exception 'PROJECT_PROPOSAL_MANAGE_FORBIDDEN' using errcode = '42501';
  end if;
  if p_idempotency_key is null then
    raise exception 'PROPOSAL_IDEMPOTENCY_KEY_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('proposal-revision:' || p_proposal_id::text, 0));

  select * into v_proposal
  from public.customer_project_proposals p
  where p.id = p_proposal_id
  for update;
  if not found then
    raise exception 'PROJECT_PROPOSAL_NOT_FOUND';
  end if;
  if v_proposal.status = 'accepted' then
    raise exception 'PROPOSAL_ACCEPTED_CHANGE_ORDER_REQUIRED';
  end if;

  select r.id into v_revision_id
  from public.customer_project_proposal_revisions r
  where r.proposal_id = p_proposal_id
    and r.create_idempotency_key = p_idempotency_key;
  if found then
    return v_revision_id;
  end if;

  if exists (
    select 1 from public.customer_project_proposal_revisions r
    where r.proposal_id = p_proposal_id and r.state = 'draft'
  ) then
    raise exception 'PROPOSAL_DRAFT_ALREADY_EXISTS';
  end if;

  select * into v_source
  from public.customer_project_proposal_revisions r
  where r.proposal_id = p_proposal_id
  order by r.revision_no desc
  limit 1;
  if not found then
    raise exception 'PROPOSAL_REVISION_NOT_FOUND';
  end if;

  select coalesce(max(r.revision_no), 0) + 1 into v_revision_no
  from public.customer_project_proposal_revisions r
  where r.proposal_id = p_proposal_id;

  insert into public.customer_project_proposal_revisions(
    proposal_id, revision_no, state, currency_code, valid_until,
    customer_message, terms_text, revision_note, create_idempotency_key,
    created_by, updated_by
  ) values (
    p_proposal_id, v_revision_no, 'draft', v_source.currency_code, v_source.valid_until,
    v_source.customer_message, v_source.terms_text,
    nullif(btrim(coalesce(p_revision_note, '')), ''), p_idempotency_key,
    auth.uid(), auth.uid()
  ) returning id into v_revision_id;

  for v_group in
    select * from public.customer_project_proposal_pricing_groups g
    where g.revision_id = v_source.id
    order by g.sort_order, g.created_at, g.id
  loop
    insert into public.customer_project_proposal_pricing_groups(
      revision_id, label, description, sell_amount, sort_order, created_by, updated_by
    ) values (
      v_revision_id, v_group.label, v_group.description, v_group.sell_amount,
      v_group.sort_order, auth.uid(), auth.uid()
    ) returning id into v_new_group_id;
    v_group_map := v_group_map || jsonb_build_object(v_group.id::text, v_new_group_id::text);
  end loop;

  for v_area in
    select * from public.customer_project_proposal_areas a
    where a.revision_id = v_source.id
    order by a.sort_order, a.created_at, a.id
  loop
    insert into public.customer_project_proposal_areas(
      revision_id, area_type_id, area_name, readiness_status, status_note,
      material_product_id, material_description, supplier_snapshot, finish, thickness,
      sq_ft, linear_ft, edge_profile, edge_linear_ft, sink_quantity, sink_source,
      sink_cutout_quantity, sink_template_status, backsplash, backsplash_notes,
      scope_notes, measurement_notes, internal_notes, pricing_group_id,
      direct_sell_amount, sort_order, created_by, updated_by
    ) values (
      v_revision_id, v_area.area_type_id, v_area.area_name, v_area.readiness_status, v_area.status_note,
      v_area.material_product_id, v_area.material_description, v_area.supplier_snapshot, v_area.finish, v_area.thickness,
      v_area.sq_ft, v_area.linear_ft, v_area.edge_profile, v_area.edge_linear_ft, v_area.sink_quantity, v_area.sink_source,
      v_area.sink_cutout_quantity, v_area.sink_template_status, v_area.backsplash, v_area.backsplash_notes,
      v_area.scope_notes, v_area.measurement_notes, v_area.internal_notes,
      case when v_area.pricing_group_id is null then null else (v_group_map ->> v_area.pricing_group_id::text)::uuid end,
      v_area.direct_sell_amount, v_area.sort_order, auth.uid(), auth.uid()
    );
  end loop;

  update public.customer_project_proposals
  set status = 'draft', updated_by = auth.uid(), updated_at = now()
  where id = p_proposal_id;

  return v_revision_id;
end;
$$;

create or replace function public.update_project_proposal_draft(
  p_revision_id uuid,
  p_currency_code text,
  p_valid_until date default null,
  p_customer_message text default null,
  p_terms_text text default null,
  p_revision_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_revision public.customer_project_proposal_revisions%rowtype;
  v_currency text;
begin
  if not private.can_manage_project_proposals() then
    raise exception 'PROJECT_PROPOSAL_MANAGE_FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_revision
  from public.customer_project_proposal_revisions r
  where r.id = p_revision_id
  for update;
  if not found then
    raise exception 'PROPOSAL_REVISION_NOT_FOUND';
  end if;
  if v_revision.state <> 'draft' then
    raise exception 'PROPOSAL_REVISION_IMMUTABLE';
  end if;

  v_currency := upper(btrim(coalesce(p_currency_code, '')));
  if v_currency !~ '^[A-Z]{3}$' then
    raise exception 'PROPOSAL_CURRENCY_INVALID';
  end if;

  update public.customer_project_proposal_revisions
  set currency_code = v_currency,
      valid_until = p_valid_until,
      customer_message = nullif(btrim(coalesce(p_customer_message, '')), ''),
      terms_text = nullif(btrim(coalesce(p_terms_text, '')), ''),
      revision_note = nullif(btrim(coalesce(p_revision_note, '')), ''),
      updated_by = auth.uid(),
      updated_at = now()
  where id = p_revision_id;

  update public.customer_project_proposals
  set updated_by = auth.uid(), updated_at = now()
  where id = v_revision.proposal_id;

  return p_revision_id;
end;
$$;

create or replace function public.upsert_project_proposal_pricing_group(
  p_revision_id uuid,
  p_group jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_id uuid;
  v_existing public.customer_project_proposal_pricing_groups%rowtype;
  v_label text;
  v_amount numeric(18,2);
  v_sort integer;
begin
  if not private.can_manage_project_proposals() then
    raise exception 'PROJECT_PROPOSAL_MANAGE_FORBIDDEN' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.customer_project_proposal_revisions r
    where r.id = p_revision_id and r.state = 'draft'
  ) then
    raise exception 'PROPOSAL_REVISION_IMMUTABLE';
  end if;
  if nullif(p_group->>'id', '') is null then
    raise exception 'PROPOSAL_PRICING_GROUP_ID_REQUIRED';
  end if;

  v_id := (p_group->>'id')::uuid;
  v_label := btrim(coalesce(p_group->>'label', ''));
  if v_label = '' then
    raise exception 'PROPOSAL_PRICING_GROUP_LABEL_REQUIRED';
  end if;
  if nullif(btrim(coalesce(p_group->>'sell_amount', '')), '') is null then
    raise exception 'PROPOSAL_PRICING_GROUP_AMOUNT_REQUIRED';
  end if;
  v_amount := (p_group->>'sell_amount')::numeric(18,2);
  if v_amount < 0 then
    raise exception 'PROPOSAL_PRICING_GROUP_AMOUNT_INVALID';
  end if;
  v_sort := coalesce(nullif(btrim(coalesce(p_group->>'sort_order', '')), '')::integer, 0);

  select * into v_existing
  from public.customer_project_proposal_pricing_groups g
  where g.id = v_id;
  if found and v_existing.revision_id is distinct from p_revision_id then
    raise exception 'PROPOSAL_PRICING_GROUP_REVISION_MISMATCH';
  end if;

  insert into public.customer_project_proposal_pricing_groups(
    id, revision_id, label, description, sell_amount, sort_order, created_by, updated_by
  ) values (
    v_id, p_revision_id, v_label,
    nullif(btrim(coalesce(p_group->>'description', '')), ''),
    v_amount, v_sort, auth.uid(), auth.uid()
  )
  on conflict (id) do update set
    label = excluded.label,
    description = excluded.description,
    sell_amount = excluded.sell_amount,
    sort_order = excluded.sort_order,
    updated_by = auth.uid(),
    updated_at = now();

  return v_id;
end;
$$;

create or replace function public.delete_project_proposal_pricing_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_group public.customer_project_proposal_pricing_groups%rowtype;
begin
  if not private.can_manage_project_proposals() then
    raise exception 'PROJECT_PROPOSAL_MANAGE_FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_group
  from public.customer_project_proposal_pricing_groups g
  where g.id = p_group_id
  for update;
  if not found then
    raise exception 'PROPOSAL_PRICING_GROUP_NOT_FOUND';
  end if;
  if exists (
    select 1 from public.customer_project_proposal_areas a
    where a.pricing_group_id = p_group_id
  ) then
    raise exception 'PROPOSAL_PRICING_GROUP_IN_USE';
  end if;

  delete from public.customer_project_proposal_pricing_groups where id = p_group_id;
end;
$$;

create or replace function public.upsert_project_proposal_area(
  p_revision_id uuid,
  p_area jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_id uuid;
  v_existing public.customer_project_proposal_areas%rowtype;
  v_area_type_id uuid;
  v_area_name text;
  v_readiness text;
  v_pricing_group_id uuid;
  v_direct_sell numeric(18,2);
  v_sort integer;
begin
  if not private.can_manage_project_proposals() then
    raise exception 'PROJECT_PROPOSAL_MANAGE_FORBIDDEN' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.customer_project_proposal_revisions r
    where r.id = p_revision_id and r.state = 'draft'
  ) then
    raise exception 'PROPOSAL_REVISION_IMMUTABLE';
  end if;
  if nullif(p_area->>'id', '') is null then
    raise exception 'PROPOSAL_AREA_ID_REQUIRED';
  end if;

  v_id := (p_area->>'id')::uuid;
  v_area_name := btrim(coalesce(p_area->>'area_name', ''));
  if v_area_name = '' then
    raise exception 'PROPOSAL_AREA_NAME_REQUIRED';
  end if;

  v_area_type_id := nullif(p_area->>'area_type_id', '')::uuid;
  v_readiness := nullif(btrim(coalesce(p_area->>'readiness_status', '')), '');
  if v_readiness is not null and v_readiness not in ('not_ready','ready_to_measure','needs_remeasure','ready_to_cut') then
    raise exception 'PROPOSAL_AREA_READINESS_INVALID';
  end if;
  v_pricing_group_id := nullif(p_area->>'pricing_group_id', '')::uuid;
  v_direct_sell := nullif(btrim(coalesce(p_area->>'direct_sell_amount', '')), '')::numeric(18,2);
  if v_direct_sell is not null and v_direct_sell < 0 then
    raise exception 'PROPOSAL_AREA_SELL_AMOUNT_INVALID';
  end if;
  if v_direct_sell is not null and v_pricing_group_id is not null then
    raise exception 'PROPOSAL_AREA_DIRECT_OR_GROUP_REQUIRED';
  end if;
  v_sort := coalesce(nullif(btrim(coalesce(p_area->>'sort_order', '')), '')::integer, 0);

  select * into v_existing
  from public.customer_project_proposal_areas a
  where a.id = v_id;
  if found and v_existing.revision_id is distinct from p_revision_id then
    raise exception 'PROPOSAL_AREA_REVISION_MISMATCH';
  end if;

  if v_area_type_id is not null and not exists (
    select 1 from public.proposal_area_types t
    where t.id = v_area_type_id
      and (t.is_active or (found and v_existing.area_type_id = v_area_type_id))
  ) then
    raise exception 'PROPOSAL_AREA_TYPE_INACTIVE';
  end if;

  if v_pricing_group_id is not null and not exists (
    select 1 from public.customer_project_proposal_pricing_groups g
    where g.id = v_pricing_group_id and g.revision_id = p_revision_id
  ) then
    raise exception 'PROPOSAL_PRICING_GROUP_REVISION_MISMATCH';
  end if;

  insert into public.customer_project_proposal_areas(
    id, revision_id, area_type_id, area_name, readiness_status, status_note,
    material_product_id, material_description, supplier_snapshot, finish, thickness,
    sq_ft, linear_ft, edge_profile, edge_linear_ft, sink_quantity, sink_source,
    sink_cutout_quantity, sink_template_status, backsplash, backsplash_notes,
    scope_notes, measurement_notes, internal_notes, pricing_group_id,
    direct_sell_amount, sort_order, created_by, updated_by
  ) values (
    v_id, p_revision_id, v_area_type_id, v_area_name, v_readiness,
    nullif(btrim(coalesce(p_area->>'status_note', '')), ''),
    nullif(p_area->>'material_product_id', '')::uuid,
    nullif(btrim(coalesce(p_area->>'material_description', '')), ''),
    nullif(btrim(coalesce(p_area->>'supplier_snapshot', '')), ''),
    nullif(btrim(coalesce(p_area->>'finish', '')), ''),
    nullif(btrim(coalesce(p_area->>'thickness', '')), ''),
    nullif(btrim(coalesce(p_area->>'sq_ft', '')), '')::numeric(18,4),
    nullif(btrim(coalesce(p_area->>'linear_ft', '')), '')::numeric(18,4),
    nullif(btrim(coalesce(p_area->>'edge_profile', '')), ''),
    nullif(btrim(coalesce(p_area->>'edge_linear_ft', '')), '')::numeric(18,4),
    nullif(btrim(coalesce(p_area->>'sink_quantity', '')), '')::integer,
    nullif(btrim(coalesce(p_area->>'sink_source', '')), ''),
    nullif(btrim(coalesce(p_area->>'sink_cutout_quantity', '')), '')::integer,
    nullif(btrim(coalesce(p_area->>'sink_template_status', '')), ''),
    nullif(btrim(coalesce(p_area->>'backsplash', '')), ''),
    nullif(btrim(coalesce(p_area->>'backsplash_notes', '')), ''),
    nullif(btrim(coalesce(p_area->>'scope_notes', '')), ''),
    nullif(btrim(coalesce(p_area->>'measurement_notes', '')), ''),
    nullif(btrim(coalesce(p_area->>'internal_notes', '')), ''),
    v_pricing_group_id, v_direct_sell, v_sort, auth.uid(), auth.uid()
  )
  on conflict (id) do update set
    area_type_id = excluded.area_type_id,
    area_name = excluded.area_name,
    readiness_status = excluded.readiness_status,
    status_note = excluded.status_note,
    material_product_id = excluded.material_product_id,
    material_description = excluded.material_description,
    supplier_snapshot = excluded.supplier_snapshot,
    finish = excluded.finish,
    thickness = excluded.thickness,
    sq_ft = excluded.sq_ft,
    linear_ft = excluded.linear_ft,
    edge_profile = excluded.edge_profile,
    edge_linear_ft = excluded.edge_linear_ft,
    sink_quantity = excluded.sink_quantity,
    sink_source = excluded.sink_source,
    sink_cutout_quantity = excluded.sink_cutout_quantity,
    sink_template_status = excluded.sink_template_status,
    backsplash = excluded.backsplash,
    backsplash_notes = excluded.backsplash_notes,
    scope_notes = excluded.scope_notes,
    measurement_notes = excluded.measurement_notes,
    internal_notes = excluded.internal_notes,
    pricing_group_id = excluded.pricing_group_id,
    direct_sell_amount = excluded.direct_sell_amount,
    sort_order = excluded.sort_order,
    updated_by = auth.uid(),
    updated_at = now();

  return v_id;
end;
$$;

create or replace function public.delete_project_proposal_area(p_area_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if not private.can_manage_project_proposals() then
    raise exception 'PROJECT_PROPOSAL_MANAGE_FORBIDDEN' using errcode = '42501';
  end if;
  if not exists (select 1 from public.customer_project_proposal_areas a where a.id = p_area_id) then
    raise exception 'PROPOSAL_AREA_NOT_FOUND';
  end if;
  delete from public.customer_project_proposal_areas where id = p_area_id;
end;
$$;

create or replace function public.send_project_proposal_revision(p_revision_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_revision public.customer_project_proposal_revisions%rowtype;
  v_proposal public.customer_project_proposals%rowtype;
begin
  if not private.can_manage_project_proposals() then
    raise exception 'PROJECT_PROPOSAL_MANAGE_FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_revision
  from public.customer_project_proposal_revisions r
  where r.id = p_revision_id
  for update;
  if not found then
    raise exception 'PROPOSAL_REVISION_NOT_FOUND';
  end if;
  if v_revision.state = 'sent' then
    return p_revision_id;
  end if;
  if v_revision.state <> 'draft' then
    raise exception 'PROPOSAL_REVISION_IMMUTABLE';
  end if;

  select * into v_proposal
  from public.customer_project_proposals p
  where p.id = v_revision.proposal_id
  for update;

  if not exists (
    select 1 from public.customer_project_proposal_areas a
    where a.revision_id = p_revision_id
  ) then
    raise exception 'PROPOSAL_AREA_REQUIRED_TO_SEND';
  end if;
  if exists (
    select 1
    from public.customer_project_proposal_pricing_groups g
    where g.revision_id = p_revision_id
      and not exists (
        select 1 from public.customer_project_proposal_areas a
        where a.pricing_group_id = g.id
      )
  ) then
    raise exception 'PROPOSAL_PRICING_GROUP_AREA_REQUIRED';
  end if;

  update public.customer_project_proposal_revisions
  set state = 'superseded', superseded_at = now(), superseded_by = auth.uid(),
      updated_by = auth.uid(), updated_at = now()
  where proposal_id = v_revision.proposal_id
    and id <> p_revision_id
    and state = 'sent';

  update public.customer_project_proposal_revisions
  set state = 'sent', sent_at = now(), sent_by = auth.uid(),
      updated_by = auth.uid(), updated_at = now()
  where id = p_revision_id;

  update public.customer_project_proposals
  set status = 'sent', updated_by = auth.uid(), updated_at = now()
  where id = v_revision.proposal_id;

  return p_revision_id;
end;
$$;

create or replace function public.reject_project_proposal_revision(
  p_revision_id uuid,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_revision public.customer_project_proposal_revisions%rowtype;
  v_note text;
begin
  if not private.can_manage_project_proposals() then
    raise exception 'PROJECT_PROPOSAL_MANAGE_FORBIDDEN' using errcode = '42501';
  end if;

  v_note := nullif(btrim(coalesce(p_note, '')), '');
  select * into v_revision
  from public.customer_project_proposal_revisions r
  where r.id = p_revision_id
  for update;
  if not found then
    raise exception 'PROPOSAL_REVISION_NOT_FOUND';
  end if;
  if v_revision.state = 'rejected' then
    if v_revision.rejection_note is not distinct from v_note then
      return p_revision_id;
    end if;
    raise exception 'PROPOSAL_REJECTION_ALREADY_RECORDED';
  end if;
  if v_revision.state <> 'sent' then
    raise exception 'PROPOSAL_REVISION_REJECT_REQUIRES_SENT';
  end if;

  update public.customer_project_proposal_revisions
  set state = 'rejected', rejected_at = now(), rejected_by = auth.uid(), rejection_note = v_note,
      updated_by = auth.uid(), updated_at = now()
  where id = p_revision_id;

  update public.customer_project_proposals
  set status = 'rejected', updated_by = auth.uid(), updated_at = now()
  where id = v_revision.proposal_id;

  return p_revision_id;
end;
$$;

create or replace function public.accept_project_proposal_revision(
  p_revision_id uuid,
  p_accepted_name text,
  p_accepted_email text default null,
  p_acceptance_method text default 'manual',
  p_signature_text text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_revision public.customer_project_proposal_revisions%rowtype;
  v_proposal public.customer_project_proposals%rowtype;
  v_existing public.customer_project_proposal_acceptances%rowtype;
  v_acceptance_id uuid;
  v_name text;
  v_email text;
  v_method text;
  v_signature text;
begin
  if not private.can_manage_project_proposals() then
    raise exception 'PROJECT_PROPOSAL_MANAGE_FORBIDDEN' using errcode = '42501';
  end if;

  v_name := btrim(coalesce(p_accepted_name, ''));
  v_email := nullif(btrim(coalesce(p_accepted_email, '')), '');
  v_method := btrim(coalesce(p_acceptance_method, ''));
  v_signature := nullif(btrim(coalesce(p_signature_text, '')), '');
  if v_name = '' then
    raise exception 'PROPOSAL_ACCEPTED_NAME_REQUIRED';
  end if;
  if v_method = '' then
    raise exception 'PROPOSAL_ACCEPTANCE_METHOD_REQUIRED';
  end if;

  select * into v_revision
  from public.customer_project_proposal_revisions r
  where r.id = p_revision_id
  for update;
  if not found then
    raise exception 'PROPOSAL_REVISION_NOT_FOUND';
  end if;

  if v_revision.state = 'accepted' then
    select * into v_existing
    from public.customer_project_proposal_acceptances a
    where a.revision_id = p_revision_id;
    if found
      and v_existing.accepted_name = v_name
      and v_existing.accepted_email is not distinct from v_email
      and v_existing.acceptance_method = v_method
      and v_existing.signature_text is not distinct from v_signature then
      return v_existing.id;
    end if;
    raise exception 'PROPOSAL_ACCEPTANCE_ALREADY_RECORDED';
  end if;
  if v_revision.state <> 'sent' then
    raise exception 'PROPOSAL_REVISION_ACCEPT_REQUIRES_SENT';
  end if;

  select * into v_proposal
  from public.customer_project_proposals p
  where p.id = v_revision.proposal_id
  for update;

  update public.customer_project_proposal_revisions
  set state = 'superseded', superseded_at = now(), superseded_by = auth.uid(),
      updated_by = auth.uid(), updated_at = now()
  where proposal_id = v_revision.proposal_id
    and id <> p_revision_id
    and state in ('draft','sent');

  update public.customer_project_proposal_revisions
  set state = 'accepted', accepted_at = now(), accepted_by = auth.uid(),
      updated_by = auth.uid(), updated_at = now()
  where id = p_revision_id;

  insert into public.customer_project_proposal_acceptances(
    revision_id, accepted_name, accepted_email, acceptance_method, signature_text, created_by
  ) values (
    p_revision_id, v_name, v_email, v_method, v_signature, auth.uid()
  ) returning id into v_acceptance_id;

  update public.customer_project_proposals
  set status = 'accepted', updated_by = auth.uid(), updated_at = now()
  where id = v_revision.proposal_id;

  return v_acceptance_id;
end;
$$;

alter table public.proposal_area_types enable row level security;
alter table public.customer_project_proposals enable row level security;
alter table public.customer_project_proposal_revisions enable row level security;
alter table public.customer_project_proposal_pricing_groups enable row level security;
alter table public.customer_project_proposal_areas enable row level security;
alter table public.customer_project_proposal_acceptances enable row level security;

revoke all on sequence public.customer_project_proposal_number_seq from public, anon, authenticated;
revoke all on public.proposal_area_types from public, anon, authenticated;
revoke all on public.customer_project_proposals from public, anon, authenticated;
revoke all on public.customer_project_proposal_revisions from public, anon, authenticated;
revoke all on public.customer_project_proposal_pricing_groups from public, anon, authenticated;
revoke all on public.customer_project_proposal_areas from public, anon, authenticated;
revoke all on public.customer_project_proposal_acceptances from public, anon, authenticated;

revoke all on function private.can_view_project_proposals() from public, anon, authenticated;
revoke all on function private.can_manage_project_proposals() from public, anon, authenticated;
revoke all on function private.customer_project_proposal_total(uuid) from public, anon, authenticated;
revoke all on function private.guard_customer_project_proposal_revision() from public, anon, authenticated;
revoke all on function private.guard_customer_project_proposal_pricing_group() from public, anon, authenticated;
revoke all on function private.guard_customer_project_proposal_area() from public, anon, authenticated;
revoke all on function private.reject_customer_project_proposal_acceptance_rewrite() from public, anon, authenticated;

revoke all on function public.get_proposal_area_types(boolean) from public, anon;
revoke all on function public.get_project_proposals(uuid) from public, anon;
revoke all on function public.get_project_proposal(uuid) from public, anon;
revoke all on function public.create_project_proposal(uuid,uuid,text,date,text,text) from public, anon;
revoke all on function public.create_project_proposal_revision(uuid,uuid,text) from public, anon;
revoke all on function public.update_project_proposal_draft(uuid,text,date,text,text,text) from public, anon;
revoke all on function public.upsert_project_proposal_pricing_group(uuid,jsonb) from public, anon;
revoke all on function public.delete_project_proposal_pricing_group(uuid) from public, anon;
revoke all on function public.upsert_project_proposal_area(uuid,jsonb) from public, anon;
revoke all on function public.delete_project_proposal_area(uuid) from public, anon;
revoke all on function public.send_project_proposal_revision(uuid) from public, anon;
revoke all on function public.reject_project_proposal_revision(uuid,text) from public, anon;
revoke all on function public.accept_project_proposal_revision(uuid,text,text,text,text) from public, anon;

grant execute on function public.get_proposal_area_types(boolean) to authenticated;
grant execute on function public.get_project_proposals(uuid) to authenticated;
grant execute on function public.get_project_proposal(uuid) to authenticated;
grant execute on function public.create_project_proposal(uuid,uuid,text,date,text,text) to authenticated;
grant execute on function public.create_project_proposal_revision(uuid,uuid,text) to authenticated;
grant execute on function public.update_project_proposal_draft(uuid,text,date,text,text,text) to authenticated;
grant execute on function public.upsert_project_proposal_pricing_group(uuid,jsonb) to authenticated;
grant execute on function public.delete_project_proposal_pricing_group(uuid) to authenticated;
grant execute on function public.upsert_project_proposal_area(uuid,jsonb) to authenticated;
grant execute on function public.delete_project_proposal_area(uuid) to authenticated;
grant execute on function public.send_project_proposal_revision(uuid) to authenticated;
grant execute on function public.reject_project_proposal_revision(uuid,text) to authenticated;
grant execute on function public.accept_project_proposal_revision(uuid,text,text,text,text) to authenticated;
