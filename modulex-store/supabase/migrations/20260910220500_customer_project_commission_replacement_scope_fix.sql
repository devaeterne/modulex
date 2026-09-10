-- Preserve the original category/product/order scope when Finance/Admin corrects
-- a Pending commission without explicitly changing that scope.

create or replace function public.replace_customer_project_commission_obligation(
  p_obligation_id uuid,
  p_basis_type text,
  p_currency_code text,
  p_scope_type text default 'project',
  p_rate numeric default null,
  p_flat_amount numeric default null,
  p_order_id uuid default null,
  p_product_category_id uuid default null,
  p_product_id uuid default null,
  p_description text default null,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_old public.project_commission_obligations;
  v_new_id uuid;
  v_scope text;
  v_order_id uuid;
  v_category_id uuid;
  v_product_id uuid;
  v_description text;
begin
  if not public.current_user_has_any_role(array['super_admin','admin','finance']) then
    raise exception 'PROJECT_COMMISSION_MANAGE_FORBIDDEN';
  end if;
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'PROJECT_COMMISSION_REPLACEMENT_REASON_REQUIRED';
  end if;

  select * into v_old
  from public.project_commission_obligations
  where id = p_obligation_id
  for update;
  if not found then raise exception 'PROJECT_COMMISSION_NOT_FOUND'; end if;
  if private.current_project_commission_status(v_old.id) <> 'pending' then
    raise exception 'PROJECT_COMMISSION_REPLACE_PENDING_ONLY';
  end if;

  v_scope := lower(btrim(coalesce(nullif(p_scope_type, ''), v_old.scope_type)));
  v_order_id := coalesce(p_order_id, v_old.order_id);
  v_description := coalesce(p_description, v_old.description);

  if v_scope = 'category' then
    v_category_id := coalesce(
      p_product_category_id,
      case when v_old.scope_type = 'category' then v_old.product_category_id else null end
    );
    v_product_id := null;
  elsif v_scope = 'product' then
    v_product_id := coalesce(
      p_product_id,
      case when v_old.scope_type = 'product' then v_old.product_id else null end
    );
    v_category_id := null;
  elsif v_scope = 'project' then
    v_category_id := null;
    v_product_id := null;
  else
    raise exception 'PROJECT_COMMISSION_SCOPE_INVALID';
  end if;

  perform public.append_customer_project_commission_event(
    v_old.id,
    'cancelled',
    null,
    concat('Replaced: ', btrim(p_reason)),
    null
  );

  v_new_id := public.create_customer_project_commission_obligation(
    v_old.project_id,
    v_old.participant_id,
    p_basis_type,
    p_currency_code,
    v_scope,
    null,
    p_rate,
    p_flat_amount,
    v_order_id,
    v_category_id,
    v_product_id,
    v_description
  );

  return v_new_id;
end;
$$;

revoke all on function public.replace_customer_project_commission_obligation(uuid,text,text,text,numeric,numeric,uuid,uuid,uuid,text,text) from public;
revoke all on function public.replace_customer_project_commission_obligation(uuid,text,text,text,numeric,numeric,uuid,uuid,uuid,text,text) from anon;
grant execute on function public.replace_customer_project_commission_obligation(uuid,text,text,text,numeric,numeric,uuid,uuid,uuid,text,text) to authenticated;
