-- Notification delivery channels and panel feed.
-- Applied to hosted Supabase as migrations:
--   notification_delivery_rules
--   panel_notification_feed
--   sync_notification_email_rules
--   sync_general_email_settings_to_rules

create table if not exists public.notification_delivery_rules (
  event_type text primary key,
  label text not null,
  category text not null,
  description text,
  severity text not null default 'info' check (severity in ('info','success','warning','critical')),
  internal_email_enabled boolean not null default true,
  panel_enabled boolean not null default true,
  sound_enabled boolean not null default false,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.notification_delivery_rules enable row level security;

create policy notification_delivery_rules_read
on public.notification_delivery_rules for select to authenticated using (true);

create policy notification_delivery_rules_manage
on public.notification_delivery_rules for update to authenticated
using ((select public.current_user_has_any_role(array['super_admin','admin'])))
with check ((select public.current_user_has_any_role(array['super_admin','admin'])));

create or replace function public.get_panel_notification_feed(p_limit integer default 30)
returns table (
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
  select p.role into v_role from public.profiles p where p.id = auth.uid() and p.is_active = true;
  if v_role is null or v_role not in ('super_admin','admin','sales','warehouse','shipping') then
    raise exception 'Active staff access is required.';
  end if;

  return query
  select en.id, en.event_type, r.label, r.severity, r.sound_enabled,
         en.entity_type, en.entity_id,
         coalesce(o.customer_id, i.customer_id),
         coalesce(o.order_number, i.invoice_number),
         c.name, en.payload, en.created_at
  from public.email_notifications en
  join public.notification_delivery_rules r on r.event_type = en.event_type and r.panel_enabled = true
  left join public.customer_orders o on en.entity_type = 'order' and o.id = en.entity_id
  left join public.customer_invoices i on en.entity_type = 'invoice' and i.id = en.entity_id
  left join public.customers c on c.id = coalesce(o.customer_id, i.customer_id)
  where en.audience = 'internal'
    and (
      v_role in ('super_admin','admin')
      or (v_role = 'sales' and en.event_type in ('new_order','order_status_changed','price_review_required','invoice_issued','stock_review_required'))
      or (v_role = 'warehouse' and en.event_type in ('stock_review_required','order_status_changed'))
      or (v_role = 'shipping' and en.event_type in ('order_status_changed'))
    )
  order by en.created_at desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
end;
$$;

grant execute on function public.get_panel_notification_feed(integer) to authenticated;
revoke execute on function public.get_panel_notification_feed(integer) from anon;

-- Bidirectional compatibility sync keeps legacy General Settings mail toggles
-- aligned with notification_delivery_rules.internal_email_enabled.
