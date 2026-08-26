-- Transactional email notification queue and business event hooks.
-- Applied to the hosted Supabase project as migrations:
--   transactional_email_notifications
--   refine_order_email_events

alter table public.general_settings
  add column if not exists email_sender_name text,
  add column if not exists email_sender_email text,
  add column if not exists email_reply_to text,
  add column if not exists order_notification_emails text,
  add column if not exists stock_notification_emails text,
  add column if not exists pricing_notification_emails text,
  add column if not exists invoice_notification_emails text,
  add column if not exists send_customer_order_emails boolean not null default true,
  add column if not exists send_customer_invoice_emails boolean not null default true,
  add column if not exists notify_internal_new_order boolean not null default true,
  add column if not exists notify_internal_order_status boolean not null default false,
  add column if not exists notify_internal_stock_alerts boolean not null default true,
  add column if not exists notify_internal_price_alerts boolean not null default true,
  add column if not exists notify_internal_invoice_issued boolean not null default true;

create table if not exists public.email_notifications (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (length(trim(event_type)) > 0),
  audience text not null check (audience in ('customer', 'internal')),
  entity_type text not null check (entity_type in ('order', 'invoice')),
  entity_id uuid not null,
  event_key text not null unique check (length(trim(event_key)) > 0),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0 check (attempts >= 0),
  to_emails jsonb not null default '[]'::jsonb,
  resend_message_ids jsonb not null default '[]'::jsonb,
  last_error text,
  next_attempt_at timestamptz not null default now(),
  processed_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_email_notifications_queue
  on public.email_notifications (status, next_attempt_at, created_at);
create index if not exists idx_email_notifications_entity
  on public.email_notifications (entity_type, entity_id, created_at desc);

alter table public.email_notifications enable row level security;

drop policy if exists email_notifications_read on public.email_notifications;
create policy email_notifications_read
on public.email_notifications
for select
to authenticated
using ((select public.current_user_has_any_role(array['super_admin','admin','sales'])));

create or replace function private.enqueue_email_notification(
  p_event_type text,
  p_audience text,
  p_entity_type text,
  p_entity_id uuid,
  p_event_key text,
  p_payload jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.email_notifications (
    event_type, audience, entity_type, entity_id, event_key, payload
  ) values (
    p_event_type, p_audience, p_entity_type, p_entity_id, p_event_key,
    coalesce(p_payload, '{}'::jsonb)
  )
  on conflict (event_key) do nothing;
end;
$$;

revoke all on function private.enqueue_email_notification(text,text,text,uuid,text,jsonb)
from public, anon, authenticated;

create or replace function private.enqueue_order_review_notifications(
  p_order_id uuid,
  p_event_suffix text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_stock_issues jsonb;
  v_price_issues jsonb;
begin
  with required as (
    select oi.product_id,
           min(oi.sku_snapshot) as sku,
           min(oi.product_name_snapshot) as product_name,
           sum(oi.quantity) as requested_quantity
    from public.customer_order_items oi
    where oi.order_id = p_order_id and oi.product_id is not null
    group by oi.product_id
  ), available as (
    select i.product_id,
           sum(greatest(i.quantity - i.reserved_quantity, 0)) as available_quantity
    from public.inventory i
    join public.warehouses w on w.id = i.warehouse_id
    where w.is_active = true and w.warehouse_type = 'sellable'
    group by i.product_id
  )
  select jsonb_agg(jsonb_build_object(
    'product_id', r.product_id,
    'sku', r.sku,
    'product_name', r.product_name,
    'requested_quantity', r.requested_quantity,
    'available_quantity', coalesce(a.available_quantity, 0),
    'shortage_quantity', greatest(r.requested_quantity - coalesce(a.available_quantity, 0), 0)
  ) order by r.sku)
  into v_stock_issues
  from required r
  left join available a on a.product_id = r.product_id
  where coalesce(a.available_quantity, 0) < r.requested_quantity;

  if v_stock_issues is not null and jsonb_array_length(v_stock_issues) > 0 then
    perform private.enqueue_email_notification(
      'stock_review_required', 'internal', 'order', p_order_id,
      'stock_review:' || p_order_id::text || ':' || p_event_suffix,
      jsonb_build_object('issues', v_stock_issues)
    );
  end if;

  with order_context as (
    select o.id, o.price_group_id, o.currency_code
    from public.customer_orders o where o.id = p_order_id
  ), evaluated as (
    select oi.id as order_item_id,
           oi.product_id,
           oi.sku_snapshot as sku,
           oi.product_name_snapshot as product_name,
           oi.quantity,
           oi.unit_price,
           oi.price_source,
           current_price.amount as expected_price,
           case
             when current_price.amount is null then 'missing_current_price'
             when oi.price_source = 'manual' then 'manual_price'
             when round(oi.unit_price, 4) <> round(current_price.amount, 4) then 'price_mismatch'
             else null
           end as reason
    from public.customer_order_items oi
    join order_context o on o.id = oi.order_id
    left join lateral (
      select pp.amount
      from public.product_prices pp
      where pp.product_id = oi.product_id
        and pp.price_group_id = o.price_group_id
        and pp.currency_code = o.currency_code
        and pp.is_active = true
        and pp.valid_from <= now()
        and (pp.valid_to is null or pp.valid_to > now())
      order by pp.valid_from desc
      limit 1
    ) current_price on true
    where oi.order_id = p_order_id
  )
  select jsonb_agg(jsonb_build_object(
    'order_item_id', e.order_item_id,
    'product_id', e.product_id,
    'sku', e.sku,
    'product_name', e.product_name,
    'quantity', e.quantity,
    'order_price', e.unit_price,
    'expected_price', e.expected_price,
    'price_source', e.price_source,
    'reason', e.reason
  ) order by e.sku)
  into v_price_issues
  from evaluated e
  where e.reason is not null;

  if v_price_issues is not null and jsonb_array_length(v_price_issues) > 0 then
    perform private.enqueue_email_notification(
      'price_review_required', 'internal', 'order', p_order_id,
      'price_review:' || p_order_id::text || ':' || p_event_suffix,
      jsonb_build_object('issues', v_price_issues)
    );
  end if;
end;
$$;

revoke all on function private.enqueue_order_review_notifications(uuid,text)
from public, anon, authenticated;

create or replace function private.queue_order_status_email_events()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.from_status is null then
    perform private.enqueue_email_notification(
      'new_order', 'internal', 'order', new.order_id,
      'new_order:' || new.id::text,
      jsonb_build_object('status', new.to_status)
    );

    -- An internally created draft is not treated as a customer-submitted request.
    if new.to_status = 'confirmed' then
      perform private.enqueue_email_notification(
        'order_confirmed', 'customer', 'order', new.order_id,
        'customer_order_confirmed:' || new.id::text,
        jsonb_build_object('status', new.to_status)
      );
    end if;

    perform private.enqueue_order_review_notifications(
      new.order_id, 'created:' || new.id::text
    );
  else
    perform private.enqueue_email_notification(
      case when new.to_status = 'confirmed' then 'order_confirmed' else 'order_status_changed' end,
      'customer', 'order', new.order_id,
      'customer_order_status:' || new.id::text,
      jsonb_build_object(
        'from_status', new.from_status,
        'to_status', new.to_status,
        'note', new.note
      )
    );

    perform private.enqueue_email_notification(
      'order_status_changed', 'internal', 'order', new.order_id,
      'internal_order_status:' || new.id::text,
      jsonb_build_object(
        'from_status', new.from_status,
        'to_status', new.to_status,
        'note', new.note
      )
    );

    if new.to_status = 'confirmed' then
      perform private.enqueue_order_review_notifications(
        new.order_id, 'confirmed:' || new.id::text
      );
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.queue_order_status_email_events()
from public, anon, authenticated;

drop trigger if exists trg_queue_order_status_email_events
on public.customer_order_status_history;
create trigger trg_queue_order_status_email_events
after insert on public.customer_order_status_history
for each row execute function private.queue_order_status_email_events();

create or replace function private.queue_order_revision_review_events()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order_id uuid;
begin
  if new.activity_type <> 'order_revised' then return new; end if;
  v_order_id := nullif(new.metadata->>'order_id', '')::uuid;
  if v_order_id is not null then
    perform private.enqueue_order_review_notifications(
      v_order_id, 'revision:' || new.id::text
    );
  end if;
  return new;
end;
$$;

revoke all on function private.queue_order_revision_review_events()
from public, anon, authenticated;

drop trigger if exists trg_queue_order_revision_review_events
on public.customer_activity;
create trigger trg_queue_order_revision_review_events
after insert on public.customer_activity
for each row execute function private.queue_order_revision_review_events();

create or replace function private.queue_invoice_email_events()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_should_queue boolean := false;
begin
  if tg_op = 'INSERT' then
    v_should_queue := new.status = 'issued';
  elsif tg_op = 'UPDATE' then
    v_should_queue := new.status = 'issued' and old.status is distinct from new.status;
  end if;

  if v_should_queue then
    perform private.enqueue_email_notification(
      'invoice_issued', 'customer', 'invoice', new.id,
      'customer_invoice_issued:' || new.id::text, '{}'::jsonb
    );
    perform private.enqueue_email_notification(
      'invoice_issued', 'internal', 'invoice', new.id,
      'internal_invoice_issued:' || new.id::text, '{}'::jsonb
    );
  end if;
  return new;
end;
$$;

revoke all on function private.queue_invoice_email_events()
from public, anon, authenticated;

drop trigger if exists trg_queue_invoice_email_events on public.customer_invoices;
create trigger trg_queue_invoice_email_events
after insert or update of status on public.customer_invoices
for each row execute function private.queue_invoice_email_events();
