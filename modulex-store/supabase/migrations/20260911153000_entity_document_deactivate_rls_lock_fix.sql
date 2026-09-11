create or replace function public.deactivate_entity_document(p_document_id uuid)
returns public.entity_documents
language plpgsql
set search_path to ''
as $function$
declare
  v_document public.entity_documents%rowtype;
begin
  if not private.is_entity_document_mutator() then
    raise exception 'You do not have permission to deactivate Project or Order documents.' using errcode = '42501';
  end if;

  -- SELECT ... FOR UPDATE is subject to the UPDATE RLS policy. Enable the
  -- canonical lifecycle before taking the lock so an authorized mutator can
  -- see the active row through that policy.
  perform set_config('modulex.entity_document_lifecycle', 'on', true);

  select * into v_document
  from public.entity_documents d
  where d.id = p_document_id
    and d.is_active = true
  for update;

  if v_document.id is null then
    perform set_config('modulex.entity_document_lifecycle', 'off', true);
    raise exception 'Active entity document not found.' using errcode = '22023';
  end if;

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
$function$;

revoke execute on function public.deactivate_entity_document(uuid) from public, anon;
grant execute on function public.deactivate_entity_document(uuid) to authenticated;
