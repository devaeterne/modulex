begin;

create table public.customer_project_proposal_artifacts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.customer_projects(id) on delete restrict,
  proposal_id uuid not null references public.customer_project_proposals(id) on delete restrict,
  proposal_revision_id uuid not null references public.customer_project_proposal_revisions(id) on delete restrict,
  acceptance_id uuid not null references public.customer_project_proposal_acceptances(id) on delete restrict,
  customer_document_id uuid not null references public.customer_documents(id) on delete restrict,
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (proposal_revision_id),
  unique (acceptance_id),
  unique (customer_document_id)
);

create index customer_project_proposal_artifacts_project_created_idx
  on public.customer_project_proposal_artifacts (project_id, created_at desc, id);

alter table public.customer_project_proposal_artifacts enable row level security;

revoke all on public.customer_project_proposal_artifacts from public, anon, authenticated;

drop function if exists private.guard_project_proposal_artifact_lifecycle();
create function private.guard_project_proposal_artifact_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if tg_op = 'INSERT'
     and current_setting('modulex.project_proposal_artifact_lifecycle', true) = 'on' then
    return new;
  end if;

  raise exception 'Accepted Proposal artifacts are immutable and may only be created through the canonical lifecycle.'
    using errcode = '42501';
end;
$$;

revoke all on function private.guard_project_proposal_artifact_lifecycle() from public, anon, authenticated;

drop trigger if exists customer_project_proposal_artifacts_lifecycle_guard on public.customer_project_proposal_artifacts;
create trigger customer_project_proposal_artifacts_lifecycle_guard
before insert or update or delete on public.customer_project_proposal_artifacts
for each row execute function private.guard_project_proposal_artifact_lifecycle();

create or replace function public.register_project_proposal_accepted_artifact(
  p_project_id uuid,
  p_proposal_id uuid,
  p_revision_id uuid,
  p_acceptance_id uuid,
  p_file_name text,
  p_storage_path text,
  p_mime_type text,
  p_file_size_bytes bigint,
  p_content_sha256 text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_role text;
  v_customer_id uuid;
  v_proposal_number text;
  v_revision_no integer;
  v_revision_state text;
  v_proposal_status text;
  v_accepted_revision_id uuid;
  v_file_name text := nullif(btrim(coalesce(p_file_name, '')), '');
  v_storage_path text := nullif(btrim(coalesce(p_storage_path, '')), '');
  v_mime_type text := lower(nullif(btrim(coalesce(p_mime_type, '')), ''));
  v_content_sha256 text := lower(nullif(btrim(coalesce(p_content_sha256, '')), ''));
  v_expected_prefix text;
  v_existing_artifact public.customer_project_proposal_artifacts%rowtype;
  v_document public.customer_documents%rowtype;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select p.role
    into v_role
    from public.profiles p
   where p.id = auth.uid()
     and p.is_active = true;

  if v_role not in ('super_admin', 'admin', 'sales') then
    raise exception 'You do not have permission to persist accepted Proposal artifacts.' using errcode = '42501';
  end if;

  if p_project_id is null or p_proposal_id is null or p_revision_id is null or p_acceptance_id is null then
    raise exception 'Project, Proposal, Revision, and Acceptance are required.' using errcode = '22023';
  end if;

  if v_file_name is null
     or v_file_name like '%/%'
     or lower(v_file_name) not like '%.pdf' then
    raise exception 'Accepted Proposal artifact file name must be a PDF file name.' using errcode = '22023';
  end if;

  if v_storage_path is null then
    raise exception 'Accepted Proposal artifact storage path is required.' using errcode = '22023';
  end if;

  if v_mime_type is distinct from 'application/pdf' then
    raise exception 'Accepted Proposal artifact must use application/pdf.' using errcode = '22023';
  end if;

  if p_file_size_bytes is null or p_file_size_bytes <= 0 then
    raise exception 'Accepted Proposal artifact file size must be positive.' using errcode = '22023';
  end if;

  if v_content_sha256 is null or v_content_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Accepted Proposal artifact SHA-256 is invalid.' using errcode = '22023';
  end if;

  select cp.customer_id,
         pp.proposal_number,
         pr.revision_no,
         pr.state,
         pp.status,
         pp.accepted_revision_id
    into v_customer_id,
         v_proposal_number,
         v_revision_no,
         v_revision_state,
         v_proposal_status,
         v_accepted_revision_id
    from public.customer_projects cp
    join public.customer_project_proposals pp
      on pp.project_id = cp.id
    join public.customer_project_proposal_revisions pr
      on pr.proposal_id = pp.id
    join public.customer_project_proposal_acceptances pa
      on pa.revision_id = pr.id
   where cp.id = p_project_id
     and pp.id = p_proposal_id
     and pr.id = p_revision_id
     and pa.id = p_acceptance_id;

  if not found then
    raise exception 'Accepted Proposal artifact identity does not match Project, Proposal, Revision, and Acceptance.' using errcode = '22023';
  end if;

  if v_revision_state <> 'accepted'
     or v_proposal_status <> 'accepted'
     or v_accepted_revision_id is distinct from p_revision_id then
    raise exception 'Only the exact accepted Proposal Revision can be persisted as an accepted artifact.' using errcode = '22023';
  end if;

  v_expected_prefix := v_customer_id::text
    || '/projects/' || p_project_id::text
    || '/proposals/' || p_proposal_id::text
    || '/revisions/' || p_revision_id::text
    || '/accepted/';

  if v_storage_path <> v_expected_prefix || v_file_name then
    raise exception 'Accepted Proposal artifact storage path is not the canonical customer-scoped path.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_revision_id::text, 0));

  select a.*
    into v_existing_artifact
    from public.customer_project_proposal_artifacts a
   where a.proposal_revision_id = p_revision_id;

  if found then
    if v_existing_artifact.project_id is distinct from p_project_id
       or v_existing_artifact.proposal_id is distinct from p_proposal_id
       or v_existing_artifact.acceptance_id is distinct from p_acceptance_id
       or v_existing_artifact.content_sha256 is distinct from v_content_sha256 then
      raise exception 'Existing accepted Proposal artifact does not match this immutable request.' using errcode = '22023';
    end if;

    select cd.*
      into v_document
      from public.customer_documents cd
     where cd.id = v_existing_artifact.customer_document_id;

    if not found
       or v_document.customer_id is distinct from v_customer_id
       or v_document.storage_bucket is distinct from 'customer-documents'
       or v_document.storage_path is distinct from v_storage_path
       or v_document.file_name is distinct from v_file_name
       or lower(coalesce(v_document.mime_type, '')) is distinct from 'application/pdf'
       or v_document.file_size_bytes is distinct from p_file_size_bytes then
      raise exception 'Existing accepted Proposal document metadata does not match this immutable request.' using errcode = '22023';
    end if;
  else
    select cd.*
      into v_document
      from public.customer_documents cd
     where cd.storage_bucket = 'customer-documents'
       and cd.storage_path = v_storage_path;

    if found then
      if v_document.customer_id is distinct from v_customer_id
         or v_document.file_name is distinct from v_file_name
         or lower(coalesce(v_document.mime_type, '')) is distinct from 'application/pdf'
         or v_document.file_size_bytes is distinct from p_file_size_bytes
         or v_document.document_type is distinct from 'proposal_acceptance'
         or v_document.portal_visible is distinct from false
         or v_document.is_active is distinct from true then
        raise exception 'Existing customer document does not match the accepted Proposal artifact request.' using errcode = '22023';
      end if;
    else
      select *
        into v_document
        from public.register_customer_document(
          v_customer_id,
          v_file_name,
          v_storage_path,
          'proposal_acceptance',
          'application/pdf',
          p_file_size_bytes,
          'Accepted Proposal ' || v_proposal_number || ' Revision ' || v_revision_no::text
        );
    end if;

    perform set_config('modulex.project_proposal_artifact_lifecycle', 'on', true);
    insert into public.customer_project_proposal_artifacts (
      project_id,
      proposal_id,
      proposal_revision_id,
      acceptance_id,
      customer_document_id,
      content_sha256,
      created_by
    ) values (
      p_project_id,
      p_proposal_id,
      p_revision_id,
      p_acceptance_id,
      v_document.id,
      v_content_sha256,
      auth.uid()
    )
    returning * into v_existing_artifact;
    perform set_config('modulex.project_proposal_artifact_lifecycle', 'off', true);
  end if;

  select jsonb_build_object(
    'id', a.id,
    'project_id', a.project_id,
    'proposal_id', a.proposal_id,
    'proposal_revision_id', a.proposal_revision_id,
    'acceptance_id', a.acceptance_id,
    'customer_document_id', a.customer_document_id,
    'content_sha256', a.content_sha256,
    'created_by', a.created_by,
    'created_at', a.created_at,
    'file_name', cd.file_name,
    'storage_bucket', cd.storage_bucket,
    'storage_path', cd.storage_path,
    'mime_type', cd.mime_type,
    'file_size_bytes', cd.file_size_bytes,
    'portal_visible', cd.portal_visible,
    'proposal_number', pp.proposal_number,
    'revision_no', pr.revision_no,
    'accepted_at', pa.accepted_at,
    'accepted_name', pa.accepted_name,
    'acceptance_method', pa.acceptance_method
  )
    into v_result
    from public.customer_project_proposal_artifacts a
    join public.customer_documents cd on cd.id = a.customer_document_id
    join public.customer_project_proposals pp on pp.id = a.proposal_id
    join public.customer_project_proposal_revisions pr on pr.id = a.proposal_revision_id
    join public.customer_project_proposal_acceptances pa on pa.id = a.acceptance_id
   where a.id = v_existing_artifact.id;

  return v_result;
end;
$$;

create or replace function public.get_project_proposal_artifact(
  p_project_id uuid,
  p_artifact_id uuid default null,
  p_proposal_id uuid default null,
  p_revision_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_role text;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select p.role into v_role
    from public.profiles p
   where p.id = auth.uid()
     and p.is_active = true;

  if v_role not in ('super_admin', 'admin', 'sales', 'finance') then
    raise exception 'You do not have permission to view Project documents.' using errcode = '42501';
  end if;

  if p_project_id is null then
    raise exception 'Project is required.' using errcode = '22023';
  end if;

  if p_artifact_id is null and (p_proposal_id is null or p_revision_id is null) then
    raise exception 'Artifact id or Proposal/Revision identity is required.' using errcode = '22023';
  end if;

  select jsonb_build_object(
    'id', a.id,
    'project_id', a.project_id,
    'proposal_id', a.proposal_id,
    'proposal_revision_id', a.proposal_revision_id,
    'acceptance_id', a.acceptance_id,
    'customer_document_id', a.customer_document_id,
    'content_sha256', a.content_sha256,
    'created_by', a.created_by,
    'created_at', a.created_at,
    'file_name', cd.file_name,
    'storage_bucket', cd.storage_bucket,
    'storage_path', cd.storage_path,
    'mime_type', cd.mime_type,
    'file_size_bytes', cd.file_size_bytes,
    'portal_visible', cd.portal_visible,
    'proposal_number', pp.proposal_number,
    'revision_no', pr.revision_no,
    'accepted_at', pa.accepted_at,
    'accepted_name', pa.accepted_name,
    'acceptance_method', pa.acceptance_method
  )
    into v_result
    from public.customer_project_proposal_artifacts a
    join public.customer_documents cd on cd.id = a.customer_document_id
    join public.customer_project_proposals pp on pp.id = a.proposal_id
    join public.customer_project_proposal_revisions pr on pr.id = a.proposal_revision_id
    join public.customer_project_proposal_acceptances pa on pa.id = a.acceptance_id
   where a.project_id = p_project_id
     and (p_artifact_id is null or a.id = p_artifact_id)
     and (p_proposal_id is null or a.proposal_id = p_proposal_id)
     and (p_revision_id is null or a.proposal_revision_id = p_revision_id)
   limit 1;

  return v_result;
end;
$$;

create or replace function public.get_project_proposal_artifacts(p_project_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_role text;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select p.role into v_role
    from public.profiles p
   where p.id = auth.uid()
     and p.is_active = true;

  if v_role not in ('super_admin', 'admin', 'sales', 'finance') then
    raise exception 'You do not have permission to view Project documents.' using errcode = '42501';
  end if;

  if p_project_id is null then
    raise exception 'Project is required.' using errcode = '22023';
  end if;

  if not exists (select 1 from public.customer_projects cp where cp.id = p_project_id) then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', a.id,
      'project_id', a.project_id,
      'proposal_id', a.proposal_id,
      'proposal_revision_id', a.proposal_revision_id,
      'acceptance_id', a.acceptance_id,
      'customer_document_id', a.customer_document_id,
      'content_sha256', a.content_sha256,
      'created_by', a.created_by,
      'created_at', a.created_at,
      'file_name', cd.file_name,
      'storage_bucket', cd.storage_bucket,
      'storage_path', cd.storage_path,
      'mime_type', cd.mime_type,
      'file_size_bytes', cd.file_size_bytes,
      'portal_visible', cd.portal_visible,
      'proposal_number', pp.proposal_number,
      'revision_no', pr.revision_no,
      'accepted_at', pa.accepted_at,
      'accepted_name', pa.accepted_name,
      'acceptance_method', pa.acceptance_method
    ) order by pa.accepted_at desc, a.id
  ), '[]'::jsonb)
    into v_result
    from public.customer_project_proposal_artifacts a
    join public.customer_documents cd on cd.id = a.customer_document_id
    join public.customer_project_proposals pp on pp.id = a.proposal_id
    join public.customer_project_proposal_revisions pr on pr.id = a.proposal_revision_id
    join public.customer_project_proposal_acceptances pa on pa.id = a.acceptance_id
   where a.project_id = p_project_id;

  return v_result;
end;
$$;

revoke all on function public.register_project_proposal_accepted_artifact(uuid, uuid, uuid, uuid, text, text, text, bigint, text) from public, anon;
grant execute on function public.register_project_proposal_accepted_artifact(uuid, uuid, uuid, uuid, text, text, text, bigint, text) to authenticated;

revoke all on function public.get_project_proposal_artifact(uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.get_project_proposal_artifact(uuid, uuid, uuid, uuid) to authenticated;

revoke all on function public.get_project_proposal_artifacts(uuid) from public, anon;
grant execute on function public.get_project_proposal_artifacts(uuid) to authenticated;

commit;
