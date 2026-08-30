-- Phase A2.2 corrective migration: reversal serialization on an append-only ledger.
--
-- Apply immediately after sql/a2-inventory-movements.sql.
-- The base A2.2 migration revokes UPDATE on inventory_movements from authenticated
-- callers. SELECT ... FOR UPDATE on that ledger would therefore require a privilege
-- the reversal RPC intentionally no longer has. Serialize by immutable movement ID
-- with a transaction-scoped advisory lock instead, while retaining row locks on the
-- mutable inventory snapshot where stock quantities are actually changed.

begin;

create or replace function public.reverse_inventory_movement(
  p_movement_id uuid,
  p_idempotency_key uuid,
  p_reason text,
  p_reference_no text default null,
  p_notes text default null
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_original public.inventory_movements%rowtype;
  v_movement_id uuid;
  v_existing_id uuid;
  v_existing_fingerprint jsonb;
  v_existing_reversal_id uuid;
  v_available_quantity numeric;
  v_reserved_quantity numeric;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_reference_no text := nullif(btrim(coalesce(p_reference_no, '')), '');
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_request_fingerprint jsonb;
begin
  if not public.can_manage_inventory() then
    raise exception 'Permission denied: reverse_inventory_movement requires admin or warehouse role';
  end if;
  if p_idempotency_key is null then raise exception 'p_idempotency_key is required'; end if;
  if v_reason = '' then raise exception 'Reason is required for movement reversal'; end if;

  v_request_fingerprint := jsonb_build_object(
    'operation', 'reverse_inventory_movement', 'movement_id', p_movement_id,
    'reference_no', v_reference_no, 'reason', v_reason, 'notes', v_notes
  );

  -- Serialize retries of the same logical reversal first.
  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key::text, 0));
  select id, request_fingerprint into v_existing_id, v_existing_fingerprint
  from public.inventory_movements where idempotency_key = p_idempotency_key;
  if found then
    if v_existing_fingerprint = v_request_fingerprint then return v_existing_id; end if;
    raise exception 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD' using errcode = '22023';
  end if;

  -- Different idempotency keys targeting the same immutable movement must also
  -- serialize. Advisory locking avoids UPDATE privilege on inventory_movements.
  perform pg_advisory_xact_lock(hashtextextended(p_movement_id::text, 1));

  select * into v_original
  from public.inventory_movements
  where id = p_movement_id;
  if not found then raise exception 'Movement not found'; end if;
  if v_original.reversal_of_movement_id is not null then
    raise exception 'A reversal movement cannot itself be reversed';
  end if;

  select id into v_existing_reversal_id
  from public.inventory_movements
  where reversal_of_movement_id = p_movement_id;
  if found then raise exception 'Movement has already been reversed by %', v_existing_reversal_id; end if;

  v_reference_no := coalesce(v_reference_no, v_original.reference_no);

  case v_original.movement_type
    when 'in' then
      select quantity - reserved_quantity into v_available_quantity
      from public.inventory
      where product_id = v_original.product_id
        and warehouse_id = v_original.to_warehouse_id
        and location_id = v_original.to_location_id
      for update;
      if v_available_quantity is null or v_available_quantity < v_original.quantity then
        raise exception 'Cannot reverse stock in: insufficient available stock at original target';
      end if;
      update public.inventory
      set quantity = quantity - v_original.quantity
      where product_id = v_original.product_id
        and warehouse_id = v_original.to_warehouse_id
        and location_id = v_original.to_location_id;
      insert into public.inventory_movements (
        product_id, from_warehouse_id, from_location_id, movement_type, quantity,
        reference_no, reason, notes, created_by, idempotency_key, request_fingerprint,
        reversal_of_movement_id
      ) values (
        v_original.product_id, v_original.to_warehouse_id, v_original.to_location_id, 'out', v_original.quantity,
        v_reference_no, v_reason, v_notes, auth.uid(), p_idempotency_key, v_request_fingerprint,
        v_original.id
      ) returning id into v_movement_id;

    when 'out' then
      insert into public.inventory (product_id, warehouse_id, location_id, quantity, reserved_quantity, notes)
      values (v_original.product_id, v_original.from_warehouse_id, v_original.from_location_id, v_original.quantity, 0, v_notes)
      on conflict (product_id, warehouse_id, location_id)
      do update set quantity = public.inventory.quantity + excluded.quantity,
                    notes = coalesce(excluded.notes, public.inventory.notes);
      insert into public.inventory_movements (
        product_id, to_warehouse_id, to_location_id, movement_type, quantity,
        reference_no, reason, notes, created_by, idempotency_key, request_fingerprint,
        reversal_of_movement_id
      ) values (
        v_original.product_id, v_original.from_warehouse_id, v_original.from_location_id, 'in', v_original.quantity,
        v_reference_no, v_reason, v_notes, auth.uid(), p_idempotency_key, v_request_fingerprint,
        v_original.id
      ) returning id into v_movement_id;

    when 'transfer' then
      select quantity - reserved_quantity into v_available_quantity
      from public.inventory
      where product_id = v_original.product_id
        and warehouse_id = v_original.to_warehouse_id
        and location_id = v_original.to_location_id
      for update;
      if v_available_quantity is null or v_available_quantity < v_original.quantity then
        raise exception 'Cannot reverse transfer: insufficient available stock at original target';
      end if;
      update public.inventory
      set quantity = quantity - v_original.quantity
      where product_id = v_original.product_id
        and warehouse_id = v_original.to_warehouse_id
        and location_id = v_original.to_location_id;
      insert into public.inventory (product_id, warehouse_id, location_id, quantity, reserved_quantity, notes)
      values (v_original.product_id, v_original.from_warehouse_id, v_original.from_location_id, v_original.quantity, 0, v_notes)
      on conflict (product_id, warehouse_id, location_id)
      do update set quantity = public.inventory.quantity + excluded.quantity,
                    notes = coalesce(excluded.notes, public.inventory.notes);
      insert into public.inventory_movements (
        product_id, from_warehouse_id, from_location_id, to_warehouse_id, to_location_id,
        movement_type, quantity, reference_no, reason, notes, created_by,
        idempotency_key, request_fingerprint, reversal_of_movement_id
      ) values (
        v_original.product_id, v_original.to_warehouse_id, v_original.to_location_id,
        v_original.from_warehouse_id, v_original.from_location_id, 'transfer', v_original.quantity,
        v_reference_no, v_reason, v_notes, auth.uid(), p_idempotency_key, v_request_fingerprint,
        v_original.id
      ) returning id into v_movement_id;

    when 'reservation' then
      select reserved_quantity into v_reserved_quantity
      from public.inventory
      where product_id = v_original.product_id
        and warehouse_id = v_original.from_warehouse_id
        and location_id = v_original.from_location_id
      for update;
      if v_reserved_quantity is null or v_reserved_quantity < v_original.quantity then
        raise exception 'Cannot reverse reservation: reserved quantity is no longer sufficient';
      end if;
      update public.inventory
      set reserved_quantity = reserved_quantity - v_original.quantity
      where product_id = v_original.product_id
        and warehouse_id = v_original.from_warehouse_id
        and location_id = v_original.from_location_id;
      insert into public.inventory_movements (
        product_id, from_warehouse_id, from_location_id, movement_type, quantity,
        reference_no, reason, notes, created_by, idempotency_key, request_fingerprint,
        reversal_of_movement_id
      ) values (
        v_original.product_id, v_original.from_warehouse_id, v_original.from_location_id, 'release', v_original.quantity,
        v_reference_no, v_reason, v_notes, auth.uid(), p_idempotency_key, v_request_fingerprint,
        v_original.id
      ) returning id into v_movement_id;

    when 'release' then
      select quantity - reserved_quantity into v_available_quantity
      from public.inventory
      where product_id = v_original.product_id
        and warehouse_id = v_original.from_warehouse_id
        and location_id = v_original.from_location_id
      for update;
      if v_available_quantity is null or v_available_quantity < v_original.quantity then
        raise exception 'Cannot reverse reservation release: available quantity is no longer sufficient';
      end if;
      update public.inventory
      set reserved_quantity = reserved_quantity + v_original.quantity
      where product_id = v_original.product_id
        and warehouse_id = v_original.from_warehouse_id
        and location_id = v_original.from_location_id;
      insert into public.inventory_movements (
        product_id, from_warehouse_id, from_location_id, movement_type, quantity,
        reference_no, reason, notes, created_by, idempotency_key, request_fingerprint,
        reversal_of_movement_id
      ) values (
        v_original.product_id, v_original.from_warehouse_id, v_original.from_location_id, 'reservation', v_original.quantity,
        v_reference_no, v_reason, v_notes, auth.uid(), p_idempotency_key, v_request_fingerprint,
        v_original.id
      ) returning id into v_movement_id;

    else
      raise exception 'Movement type % does not have an unambiguous automatic reversal contract', v_original.movement_type;
  end case;

  return v_movement_id;
end;
$$;

revoke all on function public.reverse_inventory_movement(uuid, uuid, text, text, text) from public;
grant execute on function public.reverse_inventory_movement(uuid, uuid, text, text, text) to authenticated, service_role;

commit;
