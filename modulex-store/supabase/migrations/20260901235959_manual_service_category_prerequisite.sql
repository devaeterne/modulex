begin;

-- Manual Service uses a dedicated Product Master category. Create it only when
-- the stable business key is missing; never rewrite/reactivate an existing row.
insert into public.product_categories (name, status)
values ('Service', 'active')
on conflict (name) do nothing;

do $$
declare
  v_service_category public.product_categories%rowtype;
begin
  select *
  into v_service_category
  from public.product_categories c
  where c.name = 'Service'
  limit 1;

  if v_service_category.id is null then
    raise exception 'Service category could not be resolved.';
  end if;

  if v_service_category.status::text <> 'active' then
    raise exception 'Existing Service category conflicts with the canonical manual Service contract: category must be active.';
  end if;
end
$$;

commit;
