-- Allow Customer Reference to be revised independently from order line-item revisions.
-- This intentionally keeps the generic update_customer_order non-empty-item guard intact.

create or replace function private.apply_customer_order_customer_reference(
  p_order_id uuid,
  p_customer_reference text,
  p_revision_reason text default null
)
returns integer
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_order public.customer_orders%rowtype;
  v_new_reference text;
  v_old_reference text;
  v_revision integer;
  v_items_snapshot jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  v_new_reference := nullif(btrim(coalesce(p_customer_reference, '')), '');

  select *
  into v_order
  from public.customer_orders
  where id = p_order_id
  for update;

  if v_order.id is null then
    raise exception 'Order not found.';
  end if;

  v_old_reference := nullif(btrim(coalesce(v_order.customer_reference, '')), '');
  if v_old_reference is not distinct from v_new_reference then
    return -1;
  end if;

  select coalesce(max(revision_number), 0) + 1
  into v_revision
  from public.customer_order_revisions
  where order_id = p_order_id;

  select coalesce(
    jsonb_agg(to_jsonb(coi) order by coi.created_at, coi.id),
    '[]'::jsonb
  )
  into v_items_snapshot
  from public.customer_order_items coi
  where coi.order_id = p_order_id;

  insert into public.customer_order_revisions (
    order_id,
    revision_number,
    reason,
    order_snapshot,
    items_snapshot,
    revised_by
  ) values (
    p_order_id,
    v_revision,
    coalesce(nullif(btrim(coalesce(p_revision_reason, '')), ''), 'Customer reference updated'),
    to_jsonb(v_order),
    v_items_snapshot,
    auth.uid()
  );

  update public.customer_orders
  set customer_reference = v_new_reference,
      updated_at = now()
  where id = p_order_id;

  insert into public.customer_activity (
    customer_id,
    activity_type,
    summary,
    activity_at,
    created_by,
    order_id,
    metadata
  ) values (
    v_order.customer_id,
    'order_revised',
    'Customer reference updated',
    now(),
    auth.uid(),
    p_order_id,
    jsonb_build_object(
      'scope', 'customer_reference_only',
      'revision_number', v_revision,
      'previous_customer_reference', v_old_reference,
      'customer_reference', v_new_reference,
      'reason', nullif(btrim(coalesce(p_revision_reason, '')), '')
    )
  );

  return v_revision;
end;
$function$;

create or replace function private.update_customer_order_customer_reference(
  p_order_id uuid,
  p_customer_reference text,
  p_revision_reason text default null
)
returns integer
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
declare
  v_role text;
  v_order public.customer_orders%rowtype;
  v_mode text;
  v_old_reference text;
  v_new_reference text;
  v_request_id uuid;
begin
  select p.role
  into v_role
  from public.profiles p
  where p.id = auth.uid()
    and p.is_active = true;

  if v_role is null or v_role not in ('super_admin', 'admin', 'sales') then
    raise exception 'You do not have permission to revise customer orders.';
  end if;

  select *
  into v_order
  from public.customer_orders
  where id = p_order_id;

  if v_order.id is null then
    raise exception 'Order not found.';
  end if;

  v_old_reference := nullif(btrim(coalesce(v_order.customer_reference, '')), '');
  v_new_reference := nullif(btrim(coalesce(p_customer_reference, '')), '');

  if v_old_reference is not distinct from v_new_reference then
    return -1;
  end if;

  v_mode := private.customer_order_revision_mode(v_order.status, v_role);

  if v_mode = 'locked' then
    raise exception 'This Order can no longer be revised in its current status.';
  end if;

  if v_mode = 'approval' then
    v_request_id := private.create_approval_request(
      'order_reference_revision',
      'customer_order',
      p_order_id,
      v_order.order_number,
      coalesce(nullif(btrim(coalesce(p_revision_reason, '')), ''), 'Customer reference update'),
      jsonb_build_object(
        'updated_at', v_order.updated_at,
        'customer_reference', v_old_reference
      ),
      jsonb_build_object(
        'customer_reference', v_new_reference,
        'revision_reason', nullif(btrim(coalesce(p_revision_reason, '')), '')
      ),
      jsonb_build_object('scope', 'customer_reference_only'),
      'customer-reference:' || coalesce(v_new_reference, '<blank>')
    );
    return 0;
  end if;

  return private.apply_customer_order_customer_reference(
    p_order_id,
    v_new_reference,
    p_revision_reason
  );
end;
$function$;

create or replace function public.update_customer_order_customer_reference(
  p_order_id uuid,
  p_customer_reference text,
  p_revision_reason text default null
)
returns integer
language sql
set search_path to 'pg_catalog', 'private'
as $function$
  select private.update_customer_order_customer_reference($1, $2, $3);
$function$;

create or replace function private.review_customer_order_reference_approval(
  p_request_id uuid,
  p_decision text,
  p_note text default null
)
returns text
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
declare
  v_role text;
  v_request public.approval_requests%rowtype;
  v_order public.customer_orders%rowtype;
  v_expected_updated_at timestamptz;
  v_expected_reference text;
  v_current_reference text;
  v_revision integer;
begin
  select p.role
  into v_role
  from public.profiles p
  where p.id = auth.uid()
    and p.is_active = true;

  if v_role not in ('super_admin', 'admin') then
    raise exception 'Only Admin or Super Admin can review approval requests.';
  end if;

  if p_decision not in ('approved', 'rejected') then
    raise exception 'Decision must be approved or rejected.';
  end if;

  select *
  into v_request
  from public.approval_requests
  where id = p_request_id
  for update;

  if v_request.id is null then
    raise exception 'Approval request not found.';
  end if;

  if v_request.request_type <> 'order_reference_revision' then
    raise exception 'Approval request is not a Customer Reference revision.';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'This approval request is no longer pending.';
  end if;

  if p_decision = 'rejected' then
    update public.approval_requests
    set status = 'rejected',
        reviewed_by = auth.uid(),
        reviewed_at = now(),
        review_note = nullif(btrim(coalesce(p_note, '')), ''),
        updated_at = now()
    where id = p_request_id;

    perform private.queue_approval_event(p_request_id, 'approval_rejected');
    return 'rejected';
  end if;

  select *
  into v_order
  from public.customer_orders
  where id = v_request.entity_id
  for update;

  if v_order.id is null then
    raise exception 'Order no longer exists.';
  end if;

  v_expected_updated_at := nullif(v_request.current_snapshot->>'updated_at', '')::timestamptz;
  if v_expected_updated_at is not null and v_order.updated_at <> v_expected_updated_at then
    raise exception 'Order changed after this request was submitted. Reject this stale request and submit a new revision.';
  end if;

  v_expected_reference := nullif(btrim(coalesce(v_request.current_snapshot->>'customer_reference', '')), '');
  v_current_reference := nullif(btrim(coalesce(v_order.customer_reference, '')), '');
  if v_current_reference is distinct from v_expected_reference then
    raise exception 'Customer reference changed after this request was submitted. The request is stale.';
  end if;

  v_revision := private.apply_customer_order_customer_reference(
    v_request.entity_id,
    v_request.proposed_changes->>'customer_reference',
    coalesce(
      nullif(v_request.proposed_changes->>'revision_reason', ''),
      'Approved customer reference revision'
    )
  );

  update public.approval_requests
  set status = 'approved',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_note = nullif(btrim(coalesce(p_note, '')), ''),
      applied_at = now(),
      updated_at = now(),
      risk_summary = risk_summary || jsonb_build_object('approved_revision_number', v_revision)
  where id = p_request_id;

  perform private.queue_approval_event(p_request_id, 'approval_approved');
  return 'approved';
end;
$function$;

create or replace function private.review_approval_request_dispatch(
  p_request_id uuid,
  p_decision text,
  p_note text default null
)
returns text
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
declare
  v_request_type text;
begin
  select request_type
  into v_request_type
  from public.approval_requests
  where id = p_request_id;

  if v_request_type = 'order_reference_revision' then
    return private.review_customer_order_reference_approval(p_request_id, p_decision, p_note);
  end if;

  return private.review_approval_request(p_request_id, p_decision, p_note);
end;
$function$;

create or replace function public.review_approval_request(
  p_request_id uuid,
  p_decision text,
  p_note text default null
)
returns text
language sql
set search_path to 'pg_catalog', 'private'
as $function$
  select private.review_approval_request_dispatch($1, $2, $3);
$function$;

revoke all on function private.apply_customer_order_customer_reference(uuid, text, text) from public, anon;
revoke all on function private.update_customer_order_customer_reference(uuid, text, text) from public, anon;
revoke all on function private.review_customer_order_reference_approval(uuid, text, text) from public, anon;
revoke all on function private.review_approval_request_dispatch(uuid, text, text) from public, anon;

-- The public wrappers execute as the caller, so authenticated/service roles need the private delegate grants.
grant execute on function private.update_customer_order_customer_reference(uuid, text, text) to authenticated, service_role;
grant execute on function private.review_approval_request_dispatch(uuid, text, text) to authenticated, service_role;

revoke all on function public.update_customer_order_customer_reference(uuid, text, text) from public, anon;
grant execute on function public.update_customer_order_customer_reference(uuid, text, text) to authenticated, service_role;

-- Preserve the existing authenticated/service-only review surface after replacing the wrapper.
revoke all on function public.review_approval_request(uuid, text, text) from public, anon;
grant execute on function public.review_approval_request(uuid, text, text) to authenticated, service_role;
