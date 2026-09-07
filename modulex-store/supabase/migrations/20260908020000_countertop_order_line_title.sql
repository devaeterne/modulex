-- Draft-only manual display titles for configured Countertop order lines.
-- The canonical product_name_snapshot remains immutable; order-specific presentation lives
-- in display_name_override so historical product identity and pricing triggers stay intact.

alter table public.customer_order_items
  add column display_name_override text null;

alter table public.customer_order_items
  add constraint customer_order_items_display_name_override_valid
  check (
    display_name_override is null
    or (
      char_length(btrim(display_name_override)) between 1 and 160
      and display_name_override = btrim(display_name_override)
    )
  );

comment on column public.customer_order_items.display_name_override is
  'Optional draft-authored customer-facing order-line title. Does not replace the immutable product_name_snapshot.';

create or replace function private.set_countertop_order_item_title_v1(
  p_order_item_id uuid,
  p_title text
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_order_id uuid;
  v_order_status text;
  v_customer_id uuid;
  v_order_number text;
  v_line_no integer;
  v_previous_override text;
  v_base_title text;
  v_previous_effective_title text;
  v_normalized_override text;
  v_effective_title text;
begin
  if v_actor is null
     or not public.current_user_has_any_role(array['super_admin','admin','sales']) then
    raise exception 'You do not have permission to edit Countertop order-line titles.'
      using errcode = '42501';
  end if;

  select
    oi.order_id,
    o.status::text,
    o.customer_id,
    o.order_number,
    oi.line_no,
    oi.display_name_override,
    coalesce(
      nullif(btrim(oi.product_name_snapshot), ''),
      nullif(btrim(cc.pricing_snapshot->'stone'->>'name'), ''),
      nullif(btrim(p.name), ''),
      'Countertop'
    )
  into
    v_order_id,
    v_order_status,
    v_customer_id,
    v_order_number,
    v_line_no,
    v_previous_override,
    v_base_title
  from public.customer_order_items oi
  join public.customer_orders o on o.id = oi.order_id
  join public.countertop_configurations cc on cc.order_item_id = oi.id
  left join public.products p on p.id = oi.product_id
  where oi.id = p_order_item_id
  for update of oi;

  if not found then
    raise exception 'Configured Countertop order item not found.'
      using errcode = 'P0002';
  end if;

  if v_order_status <> 'draft' then
    raise exception 'Countertop line title can only be changed while the order is Draft.'
      using errcode = '55000';
  end if;

  v_normalized_override := nullif(btrim(coalesce(p_title,'')),'');
  if v_normalized_override is not null and char_length(v_normalized_override) > 160 then
    raise exception 'Countertop line title must be 160 characters or fewer.'
      using errcode = '22023';
  end if;

  -- Do not persist a redundant override that exactly matches the historical base title.
  if v_normalized_override is not distinct from v_base_title then
    v_normalized_override := null;
  end if;

  v_previous_effective_title := coalesce(v_previous_override, v_base_title);
  v_effective_title := coalesce(v_normalized_override, v_base_title);

  if v_normalized_override is distinct from v_previous_override then
    update public.customer_order_items
    set display_name_override = v_normalized_override
    where id = p_order_item_id;

    insert into public.customer_activity (
      customer_id,
      activity_type,
      title,
      description,
      metadata,
      actor_user_id
    ) values (
      v_customer_id,
      'order_updated',
      'Countertop line title updated',
      format(
        'Order %s line %s title changed from "%s" to "%s".',
        v_order_number,
        v_line_no,
        coalesce(v_previous_effective_title, ''),
        v_effective_title
      ),
      jsonb_build_object(
        'order_id', v_order_id,
        'order_item_id', p_order_item_id,
        'line_no', v_line_no,
        'previous_title', v_previous_effective_title,
        'new_title', v_effective_title,
        'display_name_override', v_normalized_override
      ),
      v_actor
    );
  end if;

  return v_effective_title;
end;
$$;

create or replace function public.set_countertop_order_item_title(
  p_order_item_id uuid,
  p_title text
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return private.set_countertop_order_item_title_v1(p_order_item_id, p_title);
end;
$$;

revoke all on function private.set_countertop_order_item_title_v1(uuid, text) from public, anon;
revoke all on function public.set_countertop_order_item_title(uuid, text) from public, anon;

grant execute on function private.set_countertop_order_item_title_v1(uuid, text) to authenticated;
grant execute on function public.set_countertop_order_item_title(uuid, text) to authenticated;

-- Freeze the effective display name into invoice history when an invoice is created from an order.
create or replace function private.apply_order_item_display_name_to_invoice_item()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_effective_title text;
begin
  if new.order_item_id is null then
    return new;
  end if;

  select coalesce(oi.display_name_override, oi.product_name_snapshot)
  into v_effective_title
  from public.customer_order_items oi
  where oi.id = new.order_item_id;

  if v_effective_title is not null then
    new.product_name_snapshot := v_effective_title;
  end if;

  return new;
end;
$$;

create trigger trg_customer_invoice_items_order_display_name
before insert on public.customer_invoice_items
for each row
execute function private.apply_order_item_display_name_to_invoice_item();
