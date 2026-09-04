-- PB-3B delivery correction read boundary.
-- Exposes only receipt-event identity needed by Admin correction UI.

create or replace function private.get_customer_project_procurement_delivery_events(p_commitment_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null
     or not private.current_user_has_any_role(array['super_admin','admin']::text[]) then
    raise exception 'You do not have permission to view Project procurement delivery history.' using errcode = '42501';
  end if;

  if p_commitment_id is null or not exists (
    select 1
    from public.customer_project_procurement_commitments c
    where c.id = p_commitment_id
  ) then
    raise exception 'Vendor commitment not found.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', d.id,
    'delivered_date', d.delivered_date,
    'original_quantity', d.quantity_delta,
    'corrected_quantity', greatest(d.quantity_delta - d.effective_quantity, 0::numeric),
    'effective_quantity', d.effective_quantity,
    'notes', d.notes
  ) order by d.delivered_date desc, d.created_at desc, d.id desc), '[]'::jsonb)
  into v_result
  from (
    select
      original.id,
      original.delivered_date,
      original.quantity_delta,
      original.notes,
      original.created_at,
      original.quantity_delta + coalesce((
        select sum(correction.quantity_delta)
        from public.customer_project_procurement_delivery_events correction
        where correction.correction_of_event_id = original.id
      ), 0::numeric) as effective_quantity
    from public.customer_project_procurement_delivery_events original
    where original.commitment_id = p_commitment_id
      and original.event_type = 'delivery'
      and original.quantity_delta > 0
  ) d
  where d.effective_quantity > 0;

  return v_result;
end;
$$;

create or replace function public.get_customer_project_procurement_delivery_events(p_commitment_id uuid)
returns jsonb
language sql
stable
set search_path = 'pg_catalog', 'private'
as $$ select private.get_customer_project_procurement_delivery_events($1); $$;

revoke all on function private.get_customer_project_procurement_delivery_events(uuid) from public, anon, authenticated;
revoke all on function public.get_customer_project_procurement_delivery_events(uuid) from public, anon;
grant execute on function public.get_customer_project_procurement_delivery_events(uuid) to authenticated;
