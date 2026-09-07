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
  -- PROPOSAL_REJECTION_PRESERVES_ACTIVE_DRAFT
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
  set state = 'rejected',
      rejected_at = now(),
      rejected_by = auth.uid(),
      rejection_note = v_note,
      updated_by = auth.uid(),
      updated_at = now()
  where id = p_revision_id;

  update public.customer_project_proposals
  set status = case
        when exists (
          select 1
          from public.customer_project_proposal_revisions r
          where r.proposal_id = v_revision.proposal_id
            and r.state = 'draft'
        ) then 'draft'
        else 'rejected'
      end,
      updated_by = auth.uid(),
      updated_at = now()
  where id = v_revision.proposal_id;

  return p_revision_id;
end;
$$;

revoke all on function public.reject_project_proposal_revision(uuid,text) from public, anon;
grant execute on function public.reject_project_proposal_revision(uuid,text) to authenticated;
