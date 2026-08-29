create table if not exists public.company_contact_channels (
  id uuid primary key default gen_random_uuid(),
  channel_type text not null,
  label text not null,
  value text not null,
  href text,
  sort_order integer not null default 0,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_contact_channels_type_check check (channel_type in ('email', 'phone', 'website', 'other')),
  constraint company_contact_channels_label_present check (btrim(label) <> ''),
  constraint company_contact_channels_value_present check (btrim(value) <> ''),
  constraint company_contact_channels_href_check check (
    href is null
    or href ~* '^https?://'
    or href ~* '^mailto:'
    or href ~* '^tel:'
  )
);

create table if not exists public.company_locations (
  id uuid primary key default gen_random_uuid(),
  location_type text not null,
  name text not null,
  email text,
  phone text,
  address_line_1 text,
  address_line_2 text,
  city text,
  state_region text,
  postal_code text,
  country_code text,
  map_url text,
  sort_order integer not null default 0,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_locations_type_check check (location_type in ('office', 'showroom', 'warehouse', 'other')),
  constraint company_locations_name_present check (btrim(name) <> ''),
  constraint company_locations_country_code_check check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  constraint company_locations_map_url_check check (map_url is null or map_url ~* '^https?://')
);

create table if not exists public.company_location_hours (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.company_locations(id) on delete cascade,
  day_of_week smallint not null,
  opens_at time,
  closes_at time,
  is_closed boolean not null default false,
  note text,
  constraint company_location_hours_day_check check (day_of_week between 0 and 6),
  constraint company_location_hours_time_check check (
    is_closed
    or (opens_at is not null and closes_at is not null and opens_at < closes_at)
  ),
  constraint company_location_hours_location_day_key unique (location_id, day_of_week)
);

create index if not exists idx_company_contact_channels_public_order
  on public.company_contact_channels (is_active, sort_order, label, id);
create index if not exists idx_company_locations_public_order
  on public.company_locations (is_active, location_type, sort_order, name, id);
create index if not exists idx_company_location_hours_location_day
  on public.company_location_hours (location_id, day_of_week, id);

drop trigger if exists trg_company_contact_channels_updated_at on public.company_contact_channels;
create trigger trg_company_contact_channels_updated_at
before update on public.company_contact_channels
for each row execute function private.touch_store_updated_at();

drop trigger if exists trg_company_locations_updated_at on public.company_locations;
create trigger trg_company_locations_updated_at
before update on public.company_locations
for each row execute function private.touch_store_updated_at();

alter table public.company_contact_channels enable row level security;
alter table public.company_locations enable row level security;
alter table public.company_location_hours enable row level security;

revoke all on table public.company_contact_channels from anon;
revoke all on table public.company_locations from anon;
revoke all on table public.company_location_hours from anon;
revoke all on table public.company_contact_channels from authenticated;
revoke all on table public.company_locations from authenticated;
revoke all on table public.company_location_hours from authenticated;

grant select, insert, update, delete on table public.company_contact_channels to authenticated;
grant select, insert, update, delete on table public.company_locations to authenticated;
grant select, insert, update, delete on table public.company_location_hours to authenticated;

create policy company_contact_channels_admin_all
on public.company_contact_channels for all to authenticated
using ((select public.current_user_has_any_role(array['super_admin', 'admin']::text[])))
with check ((select public.current_user_has_any_role(array['super_admin', 'admin']::text[])));

create policy company_locations_admin_all
on public.company_locations for all to authenticated
using ((select public.current_user_has_any_role(array['super_admin', 'admin']::text[])))
with check ((select public.current_user_has_any_role(array['super_admin', 'admin']::text[])));

create policy company_location_hours_admin_all
on public.company_location_hours for all to authenticated
using ((select public.current_user_has_any_role(array['super_admin', 'admin']::text[])))
with check ((select public.current_user_has_any_role(array['super_admin', 'admin']::text[])));

create or replace function store_api_private.get_store_public_company_locations()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'contactChannels', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', c.id,
            'channelType', c.channel_type,
            'label', c.label,
            'value', c.value,
            'href', c.href
          ) order by c.sort_order asc, c.label asc, c.id asc
        )
        from public.company_contact_channels c
        where c.is_active = true
      ),
      '[]'::jsonb
    ),
    'locations', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', l.id,
            'locationType', l.location_type,
            'name', l.name,
            'email', l.email,
            'phone', l.phone,
            'addressLine1', l.address_line_1,
            'addressLine2', l.address_line_2,
            'city', l.city,
            'stateRegion', l.state_region,
            'postalCode', l.postal_code,
            'countryCode', l.country_code,
            'mapUrl', l.map_url,
            'hours', coalesce(
              (
                select jsonb_agg(
                  jsonb_build_object(
                    'dayOfWeek', h.day_of_week,
                    'opensAt', h.opens_at,
                    'closesAt', h.closes_at,
                    'isClosed', h.is_closed,
                    'note', h.note
                  ) order by h.day_of_week asc, h.id asc
                )
                from public.company_location_hours h
                where h.location_id = l.id
              ),
              '[]'::jsonb
            )
          ) order by l.sort_order asc, l.name asc, l.id asc
        )
        from public.company_locations l
        where l.is_active = true
      ),
      '[]'::jsonb
    )
  );
$$;

revoke all on function store_api_private.get_store_public_company_locations() from public;
grant execute on function store_api_private.get_store_public_company_locations() to anon, authenticated;

create or replace function public.get_store_public_company_locations()
returns jsonb
language sql
stable
set search_path = pg_catalog, store_api_private
as $$
  select store_api_private.get_store_public_company_locations();
$$;

revoke all on function public.get_store_public_company_locations() from public;
grant execute on function public.get_store_public_company_locations() to anon, authenticated;
