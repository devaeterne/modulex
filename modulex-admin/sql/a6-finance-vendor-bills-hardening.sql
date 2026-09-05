-- A6-F3B hardening:
--   * preserve incoming procurement/vendor source snapshots while canonical vendor_id owns AP identity;
--   * allow any explicitly mapped Vendor source identity (including Vendor Catalog) to resolve to canonical AP identity;
--   * keep Bill-line trigger return semantics explicit for INSERT/UPDATE/DELETE;
--   * cancelling a draft preserves the AP source-document and audit history instead of deleting it.

create or replace function private.vendor_invoice_resolve_vendor_by_code(p_vendor_code text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $function$
  select x.vendor_id
  from (
    select v.id as vendor_id, 0 as priority
    from public.vendors v
    where lower(v.code) = lower(btrim($1))

    union all

    select s.vendor_id, 1
    from public.vendor_source_identities s
    where lower(s.source_code) = lower(btrim($1))
  ) x
  order by x.priority
  limit 1;
$function$;

create or replace function private.vendor_invoice_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_vendor public.vendors%rowtype;
  v_days smallint;
begin
  new.invoice_number := btrim(new.invoice_number);
  new.invoice_number_key := private.vendor_invoice_normalize_number(new.invoice_number);
  new.currency_code := upper(btrim(new.currency_code));

  if new.vendor_id is null then
    new.vendor_id := private.vendor_invoice_resolve_vendor_by_code(new.vendor_code);
  end if;
  if new.vendor_id is null then
    raise exception 'Map the invoice Vendor to a canonical Vendor before recording AP.' using errcode = '23514';
  end if;

  select * into v_vendor from public.vendors where id = new.vendor_id;
  if v_vendor.id is null or v_vendor.status = 'inactive' then
    raise exception 'Canonical Vendor is missing or inactive.' using errcode = '23514';
  end if;

  -- Preserve source-system snapshot identity when it is supplied by Procurement/Vendor Invoice flows.
  -- Manual AP drafts already pass the canonical Vendor code/name, so both paths remain compatible.
  if nullif(btrim(coalesce(new.vendor_code, '')), '') is null then
    new.vendor_code := v_vendor.code;
  else
    new.vendor_code := btrim(new.vendor_code);
  end if;
  if nullif(btrim(coalesce(new.vendor_name_snapshot, '')), '') is null then
    new.vendor_name_snapshot := v_vendor.display_name;
  else
    new.vendor_name_snapshot := btrim(new.vendor_name_snapshot);
  end if;

  if new.payment_term_id is null then
    new.payment_term_id := v_vendor.payment_term_id;
  end if;
  if new.due_date is null then
    select pt.days into v_days from public.payment_terms pt where pt.id = new.payment_term_id;
    new.due_date := new.invoice_date + coalesce(v_days, 0);
  end if;

  new.purchase_order_reference := nullif(btrim(coalesce(new.purchase_order_reference, '')), '');
  new.reference_no := nullif(btrim(coalesce(new.reference_no, '')), '');
  new.notes := nullif(btrim(coalesce(new.notes, '')), '');
  new.updated_by := auth.uid();

  if new.status = 'open' then
    -- Existing record_customer_project_procurement_invoice inserts remain compatible:
    -- open source documents receive a deterministic bill-date FX snapshot here.
    new.base_currency_code := private.finance_base_currency();
    if new.currency_code = new.base_currency_code then
      new.base_amount := new.total_amount;
      new.fx_rate := null;
      new.fx_rate_source := 'same_currency';
      new.fx_rate_id := null;
    else
      select r.rate, r.rate_source, r.id
      into new.fx_rate, new.fx_rate_source, new.fx_rate_id
      from public.finance_fx_rates r
      where r.from_currency = new.currency_code
        and r.to_currency = new.base_currency_code
        and r.is_active
        and r.observed_at <= private.vendor_invoice_at(new.invoice_date)
      order by r.observed_at desc, r.created_at desc
      limit 1;

      if new.fx_rate is null then
        raise exception 'No eligible bill-date FX rate exists for this procurement Vendor Bill.' using errcode = '23514';
      end if;
      new.base_amount := round(new.total_amount * new.fx_rate, 4);
    end if;
    new.opened_at := coalesce(new.opened_at, now());
    new.opened_by := coalesce(new.opened_by, auth.uid());
  end if;

  return new;
end;
$function$;

create or replace function private.guard_vendor_invoice_lines()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_invoice_id uuid;
  v_status text;
begin
  if tg_op = 'DELETE' then
    v_invoice_id := old.invoice_id;
  else
    v_invoice_id := new.invoice_id;
  end if;

  select status into v_status
  from public.vendor_invoices
  where id = v_invoice_id;

  if v_status is null then
    raise exception 'Vendor Bill not found.' using errcode = '23503';
  end if;
  if v_status <> 'draft' then
    raise exception 'Vendor Bill lines may change only while Draft.' using errcode = '23514';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

create or replace function private.delete_vendor_invoice_draft(p_invoice_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_invoice public.vendor_invoices%rowtype;
  v_before jsonb;
begin
  perform private.finance_assert_manage();

  select * into v_invoice
  from public.vendor_invoices
  where id = p_invoice_id
  for update;

  if v_invoice.id is null or v_invoice.status <> 'draft' then
    raise exception 'Only a Vendor Bill draft can be cancelled.' using errcode = '23514';
  end if;

  v_before := to_jsonb(v_invoice);
  delete from public.vendor_invoice_lines where invoice_id = p_invoice_id;

  update public.vendor_invoices
  set status = 'void',
      voided_at = now(),
      voided_by = auth.uid(),
      void_reason = 'Draft cancelled before opening',
      updated_by = auth.uid(),
      updated_at = now()
  where id = p_invoice_id;

  perform private.vendor_invoice_write_audit(
    p_invoice_id,
    'draft_cancel',
    v_before,
    (select to_jsonb(i) from public.vendor_invoices i where i.id = p_invoice_id),
    'Draft cancelled before opening'
  );

  return p_invoice_id;
end;
$function$;

revoke all on function private.vendor_invoice_resolve_vendor_by_code(text) from public, anon, authenticated, service_role;
revoke all on function private.vendor_invoice_before_insert() from public, anon, authenticated, service_role;
revoke all on function private.guard_vendor_invoice_lines() from public, anon, authenticated, service_role;
revoke all on function private.delete_vendor_invoice_draft(uuid) from public, anon, authenticated, service_role;
