-- CUST-6 — Customer / Dealer Portal document privacy hardening.
--
-- This is a forward migration that also restores the Customer document lifecycle RPCs
-- merged in #332. Production drift showed that the earlier lifecycle migration was not
-- recorded/applied, while the Admin UI already depends on these RPCs.
--
-- Private Storage remains canonical for file bytes. Metadata registration, portal
-- visibility, soft deactivation and Customer activity must go through the canonical
-- RPCs. Browser-authenticated direct DML cannot promote a document to Portal visibility,
-- reactivate/deactivate it, move it across customers/buckets/paths, or hard-delete it.

begin;

create or replace function private.guard_customer_document_portal_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_canonical boolean := coalesce(current_setting('modulex.customer_document_lifecycle', true), '') = 'on';
begin
  if tg_op = 'INSERT' then
    if not v_canonical then
      raise exception 'Customer documents must be registered through the canonical lifecycle.' using errcode = '42501';
    end if;

    if new.storage_bucket <> 'customer-documents' then
      raise exception 'Customer documents must use the private customer-documents bucket.' using errcode = '22023';
    end if;

    if split_part(new.storage_path, '/', 1) <> new.customer_id::text then
      raise exception 'Document storage path must be scoped to the customer.' using errcode = '22023';
    end if;

    if new.portal_visible is true then
      raise exception 'New customer documents must be Portal-hidden by default.' using errcode = '42501';
    end if;

    if new.is_active is distinct from true then
      raise exception 'New customer documents must start active.' using errcode = '22023';
    end if;

    return new;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'Customer documents are append-safe; deactivate them instead of deleting metadata.' using errcode = '42501';
  end if;

  if new.customer_id is distinct from old.customer_id
     or new.storage_bucket is distinct from old.storage_bucket
     or new.storage_path is distinct from old.storage_path
     or new.uploaded_by is distinct from old.uploaded_by then
    raise exception 'Customer document ownership and storage identity are immutable.' using errcode = '42501';
  end if;

  if split_part(new.storage_path, '/', 1) <> new.customer_id::text then
    raise exception 'Document storage path must remain scoped to the customer.' using errcode = '22023';
  end if;

  if (new.portal_visible is distinct from old.portal_visible
      or new.is_active is distinct from old.is_active)
     and not v_canonical then
    raise exception 'Customer document Portal visibility/lifecycle must use the canonical RPC.' using errcode = '42501';
  end if;

  if new.is_active is false and new.portal_visible is true then
    raise exception 'Inactive customer documents cannot remain Portal-visible.' using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function private.guard_customer_document_portal_lifecycle() from public, anon, authenticated;

drop trigger if exists trg_guard_customer_document_portal_lifecycle on public.customer_documents;
create trigger trg_guard_customer_document_portal_lifecycle
before insert or update or delete on public.customer_documents
for each row execute function private.guard_customer_document_portal_lifecycle();

create or replace function public.register_customer_document(
  p_customer_id uuid,
  p_file_name text,
  p_storage_path text,
  p_document_type text default null,
  p_mime_type text default null,
  p_file_size_bytes bigint default null,
  p_description text default null
)
returns public.customer_documents
language plpgsql
security invoker
set search_path = ''
volatile
as $$
declare
  v_document public.customer_documents%rowtype;
  v_role text;
  v_file_name text := nullif(btrim(coalesce(p_file_name, '')), '');
  v_storage_path text := nullif(btrim(coalesce(p_storage_path, '')), '');
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select p.role into v_role
  from public.profiles p
  where p.id = auth.uid() and p.is_active = true;

  if v_role not in ('super_admin', 'admin', 'sales') then
    raise exception 'You do not have permission to upload customer documents.' using errcode = '42501';
  end if;

  if not exists (select 1 from public.customers c where c.id = p_customer_id) then
    raise exception 'Customer does not exist.' using errcode = '22023';
  end if;

  if v_file_name is null or v_storage_path is null then
    raise exception 'Document file name and storage path are required.' using errcode = '22023';
  end if;

  if split_part(v_storage_path, '/', 1) <> p_customer_id::text then
    raise exception 'Document storage path must be scoped to the customer.' using errcode = '22023';
  end if;

  if p_file_size_bytes is not null and p_file_size_bytes < 0 then
    raise exception 'Document file size cannot be negative.' using errcode = '22023';
  end if;

  perform set_config('modulex.customer_document_lifecycle', 'on', true);

  insert into public.customer_documents (
    customer_id,
    document_type,
    file_name,
    storage_bucket,
    storage_path,
    mime_type,
    file_size_bytes,
    description,
    is_active,
    portal_visible,
    uploaded_by
  ) values (
    p_customer_id,
    nullif(btrim(coalesce(p_document_type, '')), ''),
    v_file_name,
    'customer-documents',
    v_storage_path,
    nullif(btrim(coalesce(p_mime_type, '')), ''),
    p_file_size_bytes,
    nullif(btrim(coalesce(p_description, '')), ''),
    true,
    false,
    auth.uid()
  )
  returning * into v_document;

  insert into public.customer_activity (
    customer_id,
    activity_type,
    title,
    description,
    metadata,
    actor_user_id
  ) values (
    p_customer_id,
    'document_uploaded',
    'Customer document uploaded',
    v_document.file_name,
    jsonb_build_object(
      'document_id', v_document.id,
      'document_type', v_document.document_type,
      'portal_visible', false
    ),
    auth.uid()
  );

  return v_document;
end;
$$;

create or replace function public.set_customer_document_portal_visibility(
  p_customer_id uuid,
  p_document_id uuid,
  p_visible boolean
)
returns public.customer_documents
language plpgsql
security invoker
set search_path = ''
volatile
as $$
declare
  v_document public.customer_documents%rowtype;
  v_role text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select p.role into v_role
  from public.profiles p
  where p.id = auth.uid() and p.is_active = true;

  if v_role not in ('super_admin', 'admin') then
    raise exception 'Only Admin may change Dealer Portal document visibility.' using errcode = '42501';
  end if;

  select * into v_document
  from public.customer_documents d
  where d.id = p_document_id
    and d.customer_id = p_customer_id
    and d.is_active = true
  for update;

  if v_document.id is null then
    raise exception 'Active customer document not found.' using errcode = '22023';
  end if;

  if v_document.portal_visible is distinct from coalesce(p_visible, false) then
    perform set_config('modulex.customer_document_lifecycle', 'on', true);

    update public.customer_documents
    set portal_visible = coalesce(p_visible, false)
    where id = v_document.id
    returning * into v_document;

    insert into public.customer_activity (
      customer_id,
      activity_type,
      title,
      description,
      metadata,
      actor_user_id
    ) values (
      p_customer_id,
      'document_portal_visibility_changed',
      'Customer document portal visibility changed',
      v_document.file_name,
      jsonb_build_object(
        'document_id', v_document.id,
        'portal_visible', v_document.portal_visible
      ),
      auth.uid()
    );
  end if;

  return v_document;
end;
$$;

create or replace function public.deactivate_customer_document(
  p_customer_id uuid,
  p_document_id uuid
)
returns public.customer_documents
language plpgsql
security invoker
set search_path = ''
volatile
as $$
declare
  v_document public.customer_documents%rowtype;
  v_role text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select p.role into v_role
  from public.profiles p
  where p.id = auth.uid() and p.is_active = true;

  if v_role not in ('super_admin', 'admin', 'sales') then
    raise exception 'You do not have permission to deactivate customer documents.' using errcode = '42501';
  end if;

  select * into v_document
  from public.customer_documents d
  where d.id = p_document_id
    and d.customer_id = p_customer_id
    and d.is_active = true
  for update;

  if v_document.id is null then
    raise exception 'Active customer document not found.' using errcode = '22023';
  end if;

  perform set_config('modulex.customer_document_lifecycle', 'on', true);

  update public.customer_documents
  set is_active = false,
      portal_visible = false
  where id = v_document.id
  returning * into v_document;

  insert into public.customer_activity (
    customer_id,
    activity_type,
    title,
    description,
    metadata,
    actor_user_id
  ) values (
    p_customer_id,
    'document_deactivated',
    'Customer document deactivated',
    v_document.file_name,
    jsonb_build_object(
      'document_id', v_document.id,
      'portal_visible', false
    ),
    auth.uid()
  );

  return v_document;
end;
$$;

revoke all on function public.register_customer_document(uuid,text,text,text,text,bigint,text) from public, anon, authenticated;
revoke all on function public.set_customer_document_portal_visibility(uuid,uuid,boolean) from public, anon, authenticated;
revoke all on function public.deactivate_customer_document(uuid,uuid) from public, anon, authenticated;

grant execute on function public.register_customer_document(uuid,text,text,text,text,bigint,text) to authenticated;
grant execute on function public.set_customer_document_portal_visibility(uuid,uuid,boolean) to authenticated;
grant execute on function public.deactivate_customer_document(uuid,uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
