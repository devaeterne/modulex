-- Harden Project / Order document registration against forged or missing Storage metadata.
-- Uploaders need temporary read access to their entity-scoped unregistered object so
-- Storage upload RETURNING and the registration RPC can verify the actual object.

begin;

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
    and (
      (
        private.is_entity_document_reader()
        and exists (
          select 1
          from public.entity_documents d
          where d.storage_bucket = p_bucket_id
            and d.storage_path = p_object_name
            and d.is_active = true
        )
      )
      or
      (
        private.is_entity_document_mutator()
        and private.can_upload_entity_document_object(p_bucket_id, p_object_name)
        and not exists (
          select 1
          from public.entity_documents d
          where d.storage_bucket = p_bucket_id
            and d.storage_path = p_object_name
        )
      )
    );
$$;

revoke all on function private.can_read_entity_document_object(text,text) from public, anon;
grant execute on function private.can_read_entity_document_object(text,text) to authenticated;

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
  v_storage_metadata jsonb;
  v_storage_size bigint;
  v_storage_mime_type text;
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
  if not (
    (v_extension = '.pdf' and v_mime_type = 'application/pdf')
    or (v_extension in ('.jpg', '.jpeg') and v_mime_type = 'image/jpeg')
    or (v_extension = '.png' and v_mime_type = 'image/png')
    or (v_extension = '.webp' and v_mime_type = 'image/webp')
    or (
      v_extension = '.docx'
      and v_mime_type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )
    or (
      v_extension = '.xlsx'
      and v_mime_type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
    or (
      v_extension = '.csv'
      and v_mime_type in ('text/csv', 'application/csv', 'application/vnd.ms-excel')
    )
  ) then
    raise exception 'Document file extension does not match its MIME type.' using errcode = '22023';
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

  select o.metadata
  into v_storage_metadata
  from storage.objects o
  where o.bucket_id = 'entity-documents'
    and o.name = v_storage_path
  limit 1;

  if not found then
    raise exception 'Uploaded Storage object was not found for document registration.' using errcode = '22023';
  end if;

  begin
    v_storage_size := nullif(v_storage_metadata ->> 'size', '')::bigint;
  exception
    when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'Uploaded Storage object has invalid size metadata.' using errcode = '22023';
  end;
  v_storage_mime_type := lower(nullif(btrim(coalesce(v_storage_metadata ->> 'mimetype', '')), ''));

  if v_storage_size is null or v_storage_size <> p_file_size_bytes then
    raise exception 'Uploaded Storage object size does not match document metadata.' using errcode = '22023';
  end if;
  if v_storage_mime_type is null or v_storage_mime_type <> v_mime_type then
    raise exception 'Uploaded Storage object MIME type does not match document metadata.' using errcode = '22023';
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

revoke all on function public.register_entity_document(text,uuid,text,text,text,text,bigint,text) from public, anon, authenticated;
grant execute on function public.register_entity_document(text,uuid,text,text,text,text,bigint,text) to authenticated;

notify pgrst, 'reload schema';

commit;
