-- Runtime acceptance fix: avoid an invalid escaped JSON string literal when
-- maintaining the legacy sink compatibility metadata.
create or replace function private.validate_product_master_contract() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  v_type public.product_types;
  v_uom public.units_of_measure;
begin
  if new.uom_id is null then
    select id into new.uom_id
    from public.units_of_measure
    where code=upper(coalesce(nullif(btrim(new.unit),''),'PIECE'))
    limit 1;
    if new.uom_id is null then
      select id into new.uom_id from public.units_of_measure where code='PIECE';
    end if;
  end if;

  if new.product_type_id is null then
    select id into new.product_type_id
    from public.product_types
    where code=case when lower(coalesce(new.metadata->>'product_kind',''))='sink' then 'SINK' else 'STANDARD' end;
  end if;

  select * into v_type from public.product_types where id=new.product_type_id;
  select * into v_uom from public.units_of_measure where id=new.uom_id;

  if v_type.id is null or not v_type.is_active then
    raise exception 'Product type is inactive or invalid.';
  end if;
  if v_uom.id is null or not v_uom.is_active then
    raise exception 'Unit of measure is inactive or invalid.';
  end if;
  if not exists (
    select 1 from public.product_type_allowed_uoms a
    where a.product_type_id=v_type.id and a.uom_id=v_uom.id
  ) then
    raise exception 'Unit of measure is not allowed for this product type.';
  end if;

  new.unit := lower(v_uom.code);

  if v_type.code='SINK' then
    new.metadata := jsonb_set(
      coalesce(new.metadata,'{}'::jsonb),
      '{product_kind}',
      to_jsonb('sink'::text),
      true
    );
  elsif lower(coalesce(new.metadata->>'product_kind',''))='sink' then
    new.metadata := new.metadata - 'product_kind';
  end if;

  return new;
end;
$$;
