-- Finance role: panel notification feed access.
-- Applied to production as migration: finance_panel_notification_access

create or replace function public.get_panel_notification_feed(p_limit integer default 30)
returns table(
  id uuid,
  event_type text,
  label text,
  severity text,
  sound_enabled boolean,
  entity_type text,
  entity_id uuid,
  customer_id uuid,
  reference text,
  customer_name text,
  payload jsonb,
  created_at timestamptz
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_role text;
begin
  select p.role into v_role
  from public.profiles p
  where p.id = auth.uid() and p.is_active = true;

  if v_role is null or v_role not in ('super_admin','admin','sales','finance','warehouse','shipping') then
    raise exception 'Active staff access is required.';
  end if;

  return query
  select
    en.id,
    en.event_type,
    r.label,
    r.severity,
    r.sound_enabled,
    en.entity_type,
    en.entity_id,
    coalesce(o.customer_id, i.customer_id, dc.id) as customer_id,
    coalesce(o.order_number, i.invoice_number, dc.customer_code) as reference,
    c.name as customer_name,
    en.payload,
    en.created_at
  from public.email_notifications en
  join public.notification_delivery_rules r
    on r.event_type = en.event_type
   and r.panel_enabled = true
  left join public.customer_orders o
    on en.entity_type = 'order' and o.id = en.entity_id
  left join public.customer_invoices i
    on en.entity_type = 'invoice' and i.id = en.entity_id
  left join public.customers dc
    on en.entity_type = 'customer' and dc.id = en.entity_id
  left join public.customers c
    on c.id = coalesce(o.customer_id, i.customer_id, dc.id)
  where en.audience = 'internal'
    and (
      v_role in ('super_admin','admin')
      or (v_role = 'sales' and (
        en.event_type in ('new_order','order_status_changed','price_review_required','invoice_issued')
        or (en.event_type in ('approval_approved','approval_rejected') and en.payload->>'requested_by' = auth.uid()::text)
      ))
      or (v_role = 'finance' and en.event_type in (
        'new_order',
        'order_status_changed',
        'price_review_required',
        'invoice_issued',
        'approval_requested',
        'approval_approved',
        'approval_rejected'
      ))
      or (v_role = 'warehouse' and en.event_type in ('stock_review_required','order_status_changed'))
      or (v_role = 'shipping' and en.event_type in ('order_status_changed'))
    )
  order by en.created_at desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
end;
$function$;
