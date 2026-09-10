-- Project / Order operational document lifecycle.
-- File bytes remain private in Storage; metadata is append-safe and mutations flow
-- through canonical RPCs. Project reads may include linked Order documents without
-- duplicating either metadata or Storage objects.

begin;

create table if not exists public.entity_documents (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('project', 'order')),
  entity_id uuid not null,
  customer_id uuid not null references public.customers(id) on delete restrict,
  document_type text not null default 'other' check (
    document_type in (
      'drawing',
      'measurement',
      'contract',
      'customer_file',
      'specification',
      'photo',
      'installation',
      'change_order',
      'other'
    )
  ),
  file_name text not null check (length(btrim(file_name)) between 1 and 255),
  storage_bucket text not null default 'entity-documents' check (storage_bucket = 'entity-documents'),
  storage_path text not null unique,
  mime_type text not null,
  file_size_bytes bigint not null check (file_size_bytes between 0 and 26214400),
  description text null check (description is null or length(description) <= 1000),
  is_active boolean not null default true,
  uploaded_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  deactivated_by uuid null references public.profiles(id) on delete set null,
  deactivated_at timestamptz null,
  constraint entity_documents_deactivation_shape check (
    (is_active and deactivated_at is null and deactivated_by is null)
    or
    (not is_active and deactivated_at is not null)
  )
);

create index if not exists entity_documents_active_entity_idx
  on public.entity_documents (entity_type, entity_id, created_at desc)
  where is_active = true;

create index if not exists entity_documents_customer_idx
  on public.entity_documents (customer_id, created_at desc)
  where is_active = true;

alter table public.entity_documents enable row level security;

revoke all on table public.entity_documents from public, anon;
revoke all on table public.entity_documents from authenticated;
grant select, insert, update on table public.entity_documents to authenticated;

create or replace function private.is_entity_document_reader()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select auth.uid() is not null
    and public.current_user_has_any_role(
      array['super_admin','admin','sales','finance','warehouse','shipping']
    );
$$;

create or replace function private.is_entity_document_mutator()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select auth.uid() is not null
    and public.current_user_has_any_role(array['super_admin','admin','sales']);
$$;

revoke all on function private.is_entity_document_reader() from public, anon;
revoke all on function private.is_entity_document_mutator() from public, anon;
grant execute on function private.is_entity_document_reader() to authenticated;
grant execute on function private.is_entity_document_mutator() to authenticated;

drop policy if exists entity_documents_staff_select on public.entity_documents;
create policy entity_documents_staff_select
on public.entity_documents
for select
to authenticated
using (private.is_entity_document_reader());

drop policy if exists entity_documents_canonical_insert on public.entity_documents;
create policy entity_documents_canonical_insert
on public.entity_documents
for insert
to authenticated
with check (
  private.is_entity_document_mutator()
  and coalesce(current_setting('modulex.entity_document_lifecycle', true), '') = 'on'
);

drop policy if exists entity_documents_canonical_update on public.entity_documents;
create policy entity_documents_canonical_update
on public.entity_documents
for update
to authenticated
using (
  private.is_entity_document_mutator()
  and coalesce(current_setting('modulex.entity_document_lifecycle', true), '') = 'on'
)
with check (
  private.is_entity_document_mutator()
  and coalesce(current_setting('modulex.entity_document_lifecycle', true), '') = 'on'
);

create or replace function private.guard_entity_document_lifecycle()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_canonical boolean := coalesce(current_setting('modulex.entity_document_lifecycle', true), '') = 'on';
begin
  if tg_op = 'INSERT' then
    if not v_canonical then
      raise exception 'Entity documents must be registered through the canonical lifecycle.' using errcode = '42501';
    end if;
    if new.storage_bucket <> 'entity-documents' then
      raise exception 'Entity documents must use the private entity-documents bucket.' using errcode = '22023';
    end if;
    if split_part(new.storage_path, '/', 1) <> new.entity_type
       or split_part(new.storage_path, '/', 2) <> new.entity_id::text then
      raise exception 'Entity document storage path must be scoped to its entity.' using errcode = '22023';
    end if;
    if new.is_active is distinct from true
       or new.deactivated_at is not null
       or new.deactivated_by is not null then
      raise exception 'New entity documents must start active.' using errcode = '22023';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'Entity document metadata is append-safe; deactivate it instead.' using errcode = '42501';
  end if;

  if not v_canonical then
    raise exception 'Entity document lifecycle must use the canonical RPC.' using errcode = '42501';
  end if;

  if new.entity_type is distinct from old.entity_type
     or new.entity_id is distinct from old.entity_id
     or new.customer_id is distinct from old.customer_id
     or new.document_type is distinct from old.document_type
     or new.file_name is distinct from old.file_name
     or new.storage_bucket is distinct from old.storage_bucket
     or new.storage_path is distinct from old.storage_path
     or new.mime_type is distinct from old.mime_type
     or new.file_size_bytes is distinct from old.file_size_bytes
     or new.description is distinct from old.description
     or new.uploaded_by is distinct from old.uploaded_by
     or new.created_at is distinct from old.created_at then
    raise exception 'Entity document ownership and file metadata are immutable.' using errcode = '42501';
  end if;

  if old.is_active is false and new.is_active is true then
    raise exception 'Deactivated entity documents cannot be reactivated.' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.guard_entity_document_lifecycle() from public, anon, authenticated;

drop trigger if exists trg_guard_entity_document_lifecycle on public.entity_documents;
create trigger trg_guard_entity_document_lifecycle
before insert or update or delete on public.entity_documents
for each row execute function private.guard_entity_document_lifecycle();

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) values (
  'entity-documents',
  'entity-documents',
  false,
  25 * 1024 * 1024,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'application/csv',
    'application/vnd.ms-excel'
  ]::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function private.can_upload_entity_document_object(
  p_bucket_id text,
  p_object_name text
)
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_entity_type text := split_part(coalesce(p_object_name, ''), '/', 1);
  v_entity_id_text text := split_part(coalesce(p_object_name, ''), '/', 2);
  v_entity_id uuid;
begin
  if p_bucket_id <> 'entity-documents' or not private.is_entity_document_mutator() then
    return false;
  end if;
  if v_entity_type not in ('project', 'order') then
    return false;
  end if;
  begin
    v_entity_id := v_entity_id_text::uuid;
  exception when invalid_text_representation then
    return false;
  end;

  if v_entity_type = 'project' then
    return exists (select 1 from public.customer_projects p where p.id = v_entity_id);
  end if;
  return exists (select 1 from public.customer_orders o where o.id = v_entity_id);
end;
$$;

create or replace function private.can_read_entity_document_object(
  p_bucket_id text,
  p_object_name text
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select p_bucket_id = 'entity-documents'
    and private.is_entity_document_reader()
    and exists (
      select 1
      from public.entity_documents d
      where d.storage_bucket = p_bucket_id
        and d.storage_path = p_object_name
        and d.is_active = true
    );
$$;

create or replace function private.can_delete_unregistered_entity_document_object(
  p_bucket_id text,
  p_object_name text
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  -- Registered entity document files are retained for audit/history. Only an
  -- unregistered orphan created by a failed metadata registration may be deleted.
  select p_bucket_id = 'entity-documents'
    and private.is_entity_document_mutator()
    and not exists (
      select 1
      from public.entity_documents d
      where d.storage_bucket = p_bucket_id
        and d.storage_path = p_object_name
    );
$$;

revoke all on function private.can_upload_entity_document_object(text,text) from public, anon;
revoke all on function private.can_read_entity_document_object(text,text) from public, anon;
revoke all on function private.can_delete_unregistered_entity_document_object(text,text) from public, anon;
grant execute on function private.can_upload_entity_document_object(text,text) to authenticated;
grant execute on function private.can_read_entity_document_object(text,text) to authenticated;
grant execute on function private.can_delete_unregistered_entity_document_object(text,text) to authenticated;

drop policy if exists entity_documents_storage_insert on storage.objects;
create policy entity_documents_storage_insert
on storage.objects
for insert
to authenticated
with check (private.can_upload_entity_document_object(bucket_id, name));

drop policy if exists entity_documents_storage_select on storage.objects;
create policy entity_documents_storage_select
on storage.objects
for select
to authenticated
using (private.can_read_entity_document_object(bucket_id, name));

drop policy if exists entity_documents_storage_delete_orphan on storage.objects;
create policy entity_documents_storage_delete_orphan
on storage.objects
for delete
to authenticated
using (private.can_delete_unregistered_entity_document_object(bucket_id, name));

create or replace function public.register_entity_document(
  p_entity_type text,
  p_entity_id uuid,
  p_file_name text,
  p_storage_path text,
  p_document_type text default 'other',
  p_mime_type text default null,
  p_file_size_bytes bigint default null,
  p_description text default null
)
returns public.entity_documents
language plpgsql
security invoker
set search_path = ''
volatile
as $$
declare
  v_document public.entity_documents%rowtype;
  v_entity_type text := lower(nullif(btrim(coalesce(p_entity_type, '')), ''));
  v_file_name text := nullif(btrim(coalesce(p_file_name, '')), '');
  v_storage_path text := nullif(btrim(coalesce(p_storage_path, '')), '');
  v_document_type text := lower(coalesce(nullif(btrim(coalesce(p_document_type, '')), ''), 'other'));
  v_mime_type text := lower(nullif(btrim(coalesce(p_mime_type, '')), ''));
  v_extension text;
  v_customer_id uuid;
begin
  if not private.is_entity_document_mutator() then
    raise exception 'You do not have permission to upload Project or Order documents.' using errcode = '42501';
  end if;
  if v_entity_type not in ('project', 'order') then
    raise exception 'Document entity type must be project or order.' using errcode = '22023';
  end if;
  if v_document_type not in ('drawing','measurement','contract','customer_file','specification','photo','installation','change_order','other') then
    raise exception 'Unsupported document type.' using errcode = '22023';
  end if;
  if v_file_name is null or v_storage_path is null or v_mime_type is null or p_file_size_bytes is null then
    raise exception 'File name, storage path, MIME type and file size are required.' using errcode = '22023';
  end if;
  if length(v_file_name) > 255 then
    raise exception 'File name is too long.' using errcode = '22023';
  end if;
  if p_file_size_bytes < 0 or p_file_size_bytes > 25 * 1024 * 1024 then
    raise exception 'Document file size must not exceed 25 MiB.' using errcode = '22023';
  end if;
  if split_part(v_storage_path, '/', 1) <> v_entity_type
     or split_part(v_storage_path, '/', 2) <> p_entity_id::text then
    raise exception 'Document storage path must be scoped to the selected entity.' using errcode = '22023';
  end if;

  v_extension := lower(regexp_replace(v_file_name, '^.*(\.[^.]+)$', '\1'));
  if v_extension not in ('.pdf','.jpg','.jpeg','.png','.webp','.docx','.xlsx','.csv') then
    raise exception 'Unsupported document file extension.' using errcode = '22023';
  end if;
  if v_mime_type not in (
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'application/csv',
    'application/vnd.ms-excel'
  ) then
    raise exception 'Unsupported document MIME type.' using errcode = '22023';
  end if;

  if v_entity_type = 'project' then
    select p.customer_id into v_customer_id
    from public.customer_projects p
    where p.id = p_entity_id;
  else
    select o.customer_id into v_customer_id
    from public.customer_orders o
    where o.id = p_entity_id;
  end if;
  if v_customer_id is null then
    raise exception 'Project or Order does not exist.' using errcode = '22023';
  end if;

  perform set_config('modulex.entity_document_lifecycle', 'on', true);
  insert into public.entity_documents (
    entity_type,
    entity_id,
    customer_id,
    document_type,
    file_name,
    storage_bucket,
    storage_path,
    mime_type,
    file_size_bytes,
    description,
    is_active,
    uploaded_by
  ) values (
    v_entity_type,
    p_entity_id,
    v_customer_id,
    v_document_type,
    v_file_name,
    'entity-documents',
    v_storage_path,
    v_mime_type,
    p_file_size_bytes,
    nullif(btrim(coalesce(p_description, '')), ''),
    true,
    auth.uid()
  ) returning * into v_document;
  perform set_config('modulex.entity_document_lifecycle', 'off', true);

  insert into public.customer_activity (
    customer_id,
    activity_type,
    title,
    description,
    metadata,
    actor_user_id
  ) values (
    v_customer_id,
    'entity_document_uploaded',
    case when v_entity_type = 'project' then 'Project document uploaded' else 'Order document uploaded' end,
    v_document.file_name,
    jsonb_build_object(
      'document_id', v_document.id,
      'entity_type', v_document.entity_type,
      'entity_id', v_document.entity_id,
      'document_type', v_document.document_type
    ),
    auth.uid()
  );

  return v_document;
end;
$$;

create or replace function public.deactivate_entity_document(
  p_document_id uuid
)
returns public.entity_documents
language plpgsql
security invoker
set search_path = ''
volatile
as $$
declare
  v_document public.entity_documents%rowtype;
begin
  if not private.is_entity_document_mutator() then
    raise exception 'You do not have permission to deactivate Project or Order documents.' using errcode = '42501';
  end if;

  select * into v_document
  from public.entity_documents d
  where d.id = p_document_id
    and d.is_active = true
  for update;
  if v_document.id is null then
    raise exception 'Active entity document not found.' using errcode = '22023';
  end if;

  perform set_config('modulex.entity_document_lifecycle', 'on', true);
  update public.entity_documents
  set is_active = false,
      deactivated_by = auth.uid(),
      deactivated_at = now()
  where id = v_document.id
  returning * into v_document;
  perform set_config('modulex.entity_document_lifecycle', 'off', true);

  insert into public.customer_activity (
    customer_id,
    activity_type,
    title,
    description,
    metadata,
    actor_user_id
  ) values (
    v_document.customer_id,
    'entity_document_deactivated',
    case when v_document.entity_type = 'project' then 'Project document deactivated' else 'Order document deactivated' end,
    v_document.file_name,
    jsonb_build_object(
      'document_id', v_document.id,
      'entity_type', v_document.entity_type,
      'entity_id', v_document.entity_id
    ),
    auth.uid()
  );

  return v_document;
end;
$$;

create or replace function public.list_entity_documents(
  p_entity_type text,
  p_entity_id uuid,
  p_include_linked_orders boolean default false
)
returns table (
  id uuid,
  entity_type text,
  entity_id uuid,
  source_label text,
  document_type text,
  file_name text,
  storage_bucket text,
  storage_path text,
  mime_type text,
  file_size_bytes bigint,
  description text,
  uploaded_by uuid,
  uploaded_by_name text,
  created_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
stable
as $$
declare
  v_entity_type text := lower(nullif(btrim(coalesce(p_entity_type, '')), ''));
begin
  if not private.is_entity_document_reader() then
    raise exception 'You do not have permission to view Project or Order documents.' using errcode = '42501';
  end if;
  if v_entity_type not in ('project', 'order') then
    raise exception 'Document entity type must be project or order.' using errcode = '22023';
  end if;

  if v_entity_type = 'project' then
    if not exists (select 1 from public.customer_projects p where p.id = p_entity_id) then
      raise exception 'Project does not exist.' using errcode = '22023';
    end if;

    return query
      select
        d.id,
        d.entity_type,
        d.entity_id,
        case
          when d.entity_type = 'project' then 'Project'
          else coalesce(o.order_number, 'Order')
        end as source_label,
        d.document_type,
        d.file_name,
        d.storage_bucket,
        d.storage_path,
        d.mime_type,
        d.file_size_bytes,
        d.description,
        d.uploaded_by,
        coalesce(nullif(btrim(pr.full_name), ''), pr.email, 'Modulex user') as uploaded_by_name,
        d.created_at
      from public.entity_documents d
      left join public.customer_orders o
        on d.entity_type = 'order' and o.id = d.entity_id
      left join public.profiles pr on pr.id = d.uploaded_by
      where d.is_active = true
        and (
          (d.entity_type = 'project' and d.entity_id = p_entity_id)
          or
          (
            coalesce(p_include_linked_orders, false)
            and d.entity_type = 'order'
            and exists (
              select 1
              from public.customer_orders linked_order
              where linked_order.id = d.entity_id
                and linked_order.project_id = p_entity_id
            )
          )
        )
      order by d.created_at desc;
    return;
  end if;

  if not exists (select 1 from public.customer_orders o where o.id = p_entity_id) then
    raise exception 'Order does not exist.' using errcode = '22023';
  end if;

  return query
    select
      d.id,
      d.entity_type,
      d.entity_id,
      coalesce(o.order_number, 'Order') as source_label,
      d.document_type,
      d.file_name,
      d.storage_bucket,
      d.storage_path,
      d.mime_type,
      d.file_size_bytes,
      d.description,
      d.uploaded_by,
      coalesce(nullif(btrim(pr.full_name), ''), pr.email, 'Modulex user') as uploaded_by_name,
      d.created_at
    from public.entity_documents d
    left join public.customer_orders o on o.id = d.entity_id
    left join public.profiles pr on pr.id = d.uploaded_by
    where d.is_active = true
      and d.entity_type = 'order'
      and d.entity_id = p_entity_id
    order by d.created_at desc;
end;
$$;

revoke all on function public.register_entity_document(text,uuid,text,text,text,text,bigint,text) from public, anon, authenticated;
revoke all on function public.deactivate_entity_document(uuid) from public, anon, authenticated;
revoke all on function public.list_entity_documents(text,uuid,boolean) from public, anon, authenticated;
grant execute on function public.register_entity_document(text,uuid,text,text,text,text,bigint,text) to authenticated;
grant execute on function public.deactivate_entity_document(uuid) to authenticated;
grant execute on function public.list_entity_documents(text,uuid,boolean) to authenticated;

notify pgrst, 'reload schema';

commit;
