-- Customer document lifecycle
-- Private Storage remains canonical for file bytes; this contract controls metadata,
-- portal visibility, soft deactivation, and Customer activity atomically.

begin;

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

revoke all on function public.register_customer_document(uuid,text,text,text,text,bigint,text) from public;
revoke all on function public.register_customer_document(uuid,text,text,text,text,bigint,text) from anon;
grant execute on function public.register_customer_document(uuid,text,text,text,text,bigint,text) to authenticated;

revoke all on function public.set_customer_document_portal_visibility(uuid,uuid,boolean) from public;
revoke all on function public.set_customer_document_portal_visibility(uuid,uuid,boolean) from anon;
grant execute on function public.set_customer_document_portal_visibility(uuid,uuid,boolean) to authenticated;

revoke all on function public.deactivate_customer_document(uuid,uuid) from public;
revoke all on function public.deactivate_customer_document(uuid,uuid) from anon;
grant execute on function public.deactivate_customer_document(uuid,uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
