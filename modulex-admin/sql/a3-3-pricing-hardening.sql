/* A3.3 pricing hardening: audit every pricing write and keep lifecycle rules DB-authoritative. */
/* The existing set_product_price and set_product_prices_bulk RPCs remain the sole pricing write API. */
create or replace function public.audit_pricing_change()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.audit_logs (table_name, record_id, action, old_data, new_data, changed_by)
  values (tg_table_name, coalesce(new.id, old.id), lower(tg_op)::public.audit_action,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end, auth.uid());
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.guard_price_group_lifecycle()
returns trigger language plpgsql set search_path = pg_catalog, public
as $$
begin
  if old.is_base_price and not new.is_active then raise exception 'Base price group cannot be deactivated'; end if;
  return new;
end;
$$;

create or replace function public.guard_product_price_period()
returns trigger language plpgsql set search_path = pg_catalog, public
as $$
begin
  if exists (select 1 from public.product_prices other
    where other.product_id = new.product_id and other.price_group_id = new.price_group_id
      and other.currency_code = new.currency_code and other.id <> new.id
      and new.valid_from < coalesce(other.valid_to, 'infinity'::timestamptz)
      and other.valid_from < coalesce(new.valid_to, 'infinity'::timestamptz)) then
    raise exception 'Overlapping effective price period for product, group and currency';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_product_prices_audit on public.product_prices;
create trigger trg_product_prices_audit after insert or update or delete on public.product_prices for each row execute function public.audit_pricing_change();
drop trigger if exists trg_product_costs_audit on public.product_costs;
create trigger trg_product_costs_audit after insert or update or delete on public.product_costs for each row execute function public.audit_pricing_change();
drop trigger if exists trg_price_groups_audit on public.price_groups;
create trigger trg_price_groups_audit after insert or update or delete on public.price_groups for each row execute function public.audit_pricing_change();
drop trigger if exists trg_pricing_settings_audit on public.pricing_settings;
create trigger trg_pricing_settings_audit after insert or update or delete on public.pricing_settings for each row execute function public.audit_pricing_change();
drop trigger if exists trg_price_group_lifecycle_guard on public.price_groups;
create trigger trg_price_group_lifecycle_guard before update on public.price_groups for each row execute function public.guard_price_group_lifecycle();
drop trigger if exists trg_product_price_period_guard on public.product_prices;
create trigger trg_product_price_period_guard before insert or update on public.product_prices for each row execute function public.guard_product_price_period();

revoke all on function public.audit_pricing_change() from public, anon, authenticated;
revoke all on function public.guard_price_group_lifecycle() from public, anon, authenticated;
revoke all on function public.guard_product_price_period() from public, anon, authenticated;
alter function public.set_product_price(uuid, uuid, numeric, text) set search_path = pg_catalog, public;
alter function public.set_product_prices_bulk(jsonb, text) set search_path = pg_catalog, public;
/* Existing product_prices_current_unique_idx remains the canonical current-row rule. */
