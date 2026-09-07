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

  -- PROPOSAL_ACCEPTED_REVISION_FULLY_IMMUTABLE
  if old.state = 'accepted' then
    raise exception 'PROPOSAL_REVISION_IMMUTABLE';
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
