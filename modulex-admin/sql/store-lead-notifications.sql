-- Store lead notification delivery
-- Production migration: store_lead_notifications

alter table public.general_settings
  add column if not exists lead_notification_emails text;

alter table public.email_notifications
  drop constraint if exists email_notifications_entity_type_check;

alter table public.email_notifications
  add constraint email_notifications_entity_type_check
  check (entity_type = any (array['order'::text, 'invoice'::text, 'customer'::text, 'store_lead'::text]));

insert into public.notification_delivery_rules (
  event_type,
  label,
  category,
  description,
  severity,
  internal_email_enabled,
  panel_enabled,
  sound_enabled,
  sort_order
) values (
  'new_store_lead',
  'New Store Lead',
  'Store',
  'A new website inquiry or dealer application was submitted.',
  'info',
  true,
  true,
  true,
  15
)
on conflict (event_type) do update set
  label = excluded.label,
  category = excluded.category,
  description = excluded.description,
  severity = excluded.severity,
  updated_at = now();

create or replace function private.enqueue_store_lead_notification()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform private.enqueue_email_notification(
    'new_store_lead',
    'internal',
    'store_lead',
    new.id,
    'new_store_lead:' || new.id::text,
    jsonb_build_object(
      'reference_code', new.reference_code,
      'lead_type', new.lead_type,
      'first_name', new.first_name,
      'last_name', new.last_name,
      'company_name', new.company_name,
      'country_code', new.country_code,
      'city', new.city
    )
  );
  return new;
end;
$$;

revoke all on function private.enqueue_store_lead_notification() from public;
revoke all on function private.enqueue_store_lead_notification() from anon;
revoke all on function private.enqueue_store_lead_notification() from authenticated;

drop trigger if exists trg_queue_store_lead_notification on public.store_leads;
create trigger trg_queue_store_lead_notification
after insert on public.store_leads
for each row execute function private.enqueue_store_lead_notification();

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
set search_path = public, pg_temp
as $$
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
    coalesce(o.order_number, i.invoice_number, dc.customer_code, sl.reference_code) as reference,
    coalesce(c.name, nullif(sl.company_name, ''), nullif(trim(concat_ws(' ', sl.first_name, sl.last_name)), '')) as customer_name,
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
  left join public.store_leads sl
    on en.entity_type = 'store_lead' and sl.id = en.entity_id
  left join public.customers c
    on c.id = coalesce(o.customer_id, i.customer_id, dc.id)
  where en.audience = 'internal'
    and (
      v_role in ('super_admin','admin')
      or (v_role = 'sales' and (
        en.event_type in ('new_order','new_store_lead','order_status_changed','price_review_required','invoice_issued')
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
$$;
