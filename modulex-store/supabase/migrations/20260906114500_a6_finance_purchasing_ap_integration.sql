-- A6-F3E — Purchasing / AP Integration
-- Reuse Project Procurement commitments + allocation ledger and route Vendor Bill
-- creation/open lifecycle through the canonical A6-F3B AP core.

create or replace function private.record_customer_project_procurement_invoice(
  p_commitment_id uuid,
  p_invoice_number text,
  p_invoice_date date,
  p_invoice_total numeric,
  p_currency_code text,
  p_invoiced_quantity numeric,
  p_project_invoice_cost numeric
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_commitment public.customer_project_procurement_commitments%rowtype;
  v_invoice public.vendor_invoices%rowtype;
  v_invoice_id uuid;
  v_number text := nullif(btrim(coalesce(p_invoice_number, '')), '');
  v_key text;
  v_currency text := upper(btrim(coalesce(p_currency_code, '')));
  v_commitment_invoiced numeric(18,4);
  v_invoice_allocated numeric(18,4);
  v_allocation_id uuid;
begin
  perform private.finance_assert_manage();

  if v_number is null then raise exception 'Vendor invoice number is required.'; end if;
  if p_invoice_date is null then raise exception 'Vendor invoice date is required.'; end if;
  if p_invoice_total is null or p_invoice_total <= 0 then raise exception 'Vendor invoice total must be greater than zero.'; end if;
  if p_invoiced_quantity is null or p_invoiced_quantity <= 0 then raise exception 'Invoiced quantity must be greater than zero.'; end if;
  if p_project_invoice_cost is null or p_project_invoice_cost <= 0 then raise exception 'Project invoice cost must be greater than zero.'; end if;
  if v_currency !~ '^[A-Z]{3}$' then raise exception 'Currency must be a three-letter code.'; end if;

  select * into v_commitment
  from public.customer_project_procurement_commitments
  where id = p_commitment_id
  for update;

  if v_commitment.id is null then raise exception 'Vendor commitment not found.'; end if;
  if v_commitment.status = 'cancelled' then raise exception 'Cancelled vendor commitments cannot be invoiced.'; end if;
  if v_commitment.vendor_id is null then
    raise exception 'Project procurement commitment must be mapped to a canonical Vendor before AP invoicing.' using errcode = '23514';
  end if;
  if v_currency <> v_commitment.currency_code then
    raise exception 'Vendor invoice currency must match the vendor commitment currency.';
  end if;

  -- Canonical Vendor Bill identity is vendor_id + normalized invoice number.
  -- Historical/source vendor_code remains a Procurement snapshot and is not an AP identity key.
  v_key := private.vendor_invoice_normalize_number(v_number);
  perform pg_advisory_xact_lock(
    hashtextextended('vendor_invoice_identity:' || v_commitment.vendor_id::text || ':' || v_key, 0)
  );

  select i.* into v_invoice
  from public.vendor_invoices i
  where i.vendor_id = v_commitment.vendor_id
    and i.invoice_number_key = v_key
  for update;

  if v_invoice.id is null then
    -- Enter through the canonical F3B Vendor Bill lifecycle so due-date defaults,
    -- canonical Vendor snapshots, audit, and transaction-time FX snapshot rules stay centralized.
    v_invoice_id := private.create_vendor_invoice_draft(
      p_vendor_id => v_commitment.vendor_id,
      p_invoice_number => v_number,
      p_invoice_date => p_invoice_date,
      p_due_date => null,
      p_total_amount => p_invoice_total,
      p_currency_code => v_currency,
      p_payment_term_id => null,
      p_purchase_order_reference => nullif(btrim(coalesce(v_commitment.vendor_order_no, '')), ''),
      p_reference_no => null,
      p_notes => null,
      p_source_document_bucket => null,
      p_source_document_path => null,
      p_source_document_file_name => null,
      p_source_document_mime_type => null,
      p_source_document_size_bytes => null,
      p_idempotency_key => null
    );

    perform private.open_vendor_invoice(
      v_invoice_id,
      null,
      null,
      null
    );

    select i.* into v_invoice
    from public.vendor_invoices i
    where i.id = v_invoice_id
    for update;
  else
    if v_invoice.currency_code <> v_currency
       or v_invoice.invoice_date <> p_invoice_date
       or abs(v_invoice.total_amount - p_invoice_total) > 0.0001 then
      raise exception 'Existing vendor invoice header does not match date, total, or currency.';
    end if;

    if v_invoice.status <> 'open' then
      raise exception 'Existing Vendor Bill must be open before Project procurement allocation.' using errcode = '23514';
    end if;
  end if;

  select coalesce(sum(a.quantity_delta), 0::numeric)
  into v_commitment_invoiced
  from public.customer_project_procurement_invoice_allocations a
  where a.commitment_id = p_commitment_id;

  if v_commitment_invoiced + p_invoiced_quantity > v_commitment.ordered_quantity then
    raise exception 'Invoiced quantity cannot exceed ordered quantity.';
  end if;

  select coalesce(sum(a.amount_delta), 0::numeric)
  into v_invoice_allocated
  from public.customer_project_procurement_invoice_allocations a
  where a.invoice_id = v_invoice.id;

  if v_invoice_allocated + p_project_invoice_cost > v_invoice.total_amount then
    raise exception 'Project invoice allocations cannot exceed the vendor invoice total.';
  end if;

  insert into public.customer_project_procurement_invoice_allocations (
    invoice_id, commitment_id, project_id, quantity_delta, amount_delta,
    currency_code, actor_id
  ) values (
    v_invoice.id, v_commitment.id, v_commitment.project_id,
    p_invoiced_quantity, p_project_invoice_cost, v_currency, auth.uid()
  ) returning id into v_allocation_id;

  perform private.append_customer_project_procurement_event(
    v_commitment.project_id, 'invoice_allocated', v_commitment.requirement_id,
    v_commitment.id, v_invoice.id, v_allocation_id, null,
    jsonb_build_object(
      'invoice', to_jsonb(v_invoice),
      'allocation', (
        select to_jsonb(a)
        from public.customer_project_procurement_invoice_allocations a
        where a.id = v_allocation_id
      )
    ), null
  );

  perform private.vendor_invoice_write_audit(
    v_invoice.id,
    'procurement_allocate',
    null,
    jsonb_build_object(
      'commitment_id', v_commitment.id,
      'project_id', v_commitment.project_id,
      'allocation', (
        select to_jsonb(a)
        from public.customer_project_procurement_invoice_allocations a
        where a.id = v_allocation_id
      )
    ),
    null
  );

  return v_allocation_id;
end;
$$;

create or replace function private.reverse_customer_project_procurement_invoice_allocation(
  p_allocation_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_original public.customer_project_procurement_invoice_allocations%rowtype;
  v_commitment public.customer_project_procurement_commitments%rowtype;
  v_invoice public.vendor_invoices%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_id uuid;
begin
  perform private.finance_assert_manage();

  if v_reason is null then raise exception 'Allocation reversal reason is required.'; end if;

  select * into v_original
  from public.customer_project_procurement_invoice_allocations
  where id = p_allocation_id
  for update;

  if v_original.id is null or v_original.quantity_delta <= 0 or v_original.amount_delta <= 0 then
    raise exception 'Original positive invoice allocation not found.';
  end if;

  if exists (
    select 1
    from public.customer_project_procurement_invoice_allocations r
    where r.reversal_of_allocation_id = p_allocation_id
  ) then
    raise exception 'Invoice allocation has already been reversed.';
  end if;

  select * into v_commitment
  from public.customer_project_procurement_commitments
  where id = v_original.commitment_id
  for update;

  if v_commitment.id is null then
    raise exception 'Vendor commitment not found for invoice allocation reversal.';
  end if;

  select * into v_invoice
  from public.vendor_invoices
  where id = v_original.invoice_id
  for update;

  if v_invoice.id is null then
    raise exception 'Vendor Bill not found for invoice allocation reversal.';
  end if;

  insert into public.customer_project_procurement_invoice_allocations (
    invoice_id, commitment_id, project_id, quantity_delta, amount_delta,
    currency_code, reversal_of_allocation_id, reason, actor_id
  ) values (
    v_original.invoice_id, v_original.commitment_id, v_original.project_id,
    -v_original.quantity_delta, -v_original.amount_delta, v_original.currency_code,
    v_original.id, v_reason, auth.uid()
  ) returning id into v_id;

  perform private.append_customer_project_procurement_event(
    v_commitment.project_id, 'invoice_allocation_reversed', v_commitment.requirement_id,
    v_commitment.id, v_original.invoice_id, v_id, to_jsonb(v_original),
    (
      select to_jsonb(a)
      from public.customer_project_procurement_invoice_allocations a
      where a.id = v_id
    ), v_reason
  );

  perform private.vendor_invoice_write_audit(
    v_invoice.id,
    'procurement_allocation_reverse',
    jsonb_build_object('allocation', to_jsonb(v_original)),
    jsonb_build_object(
      'reversal', (
        select to_jsonb(a)
        from public.customer_project_procurement_invoice_allocations a
        where a.id = v_id
      )
    ),
    v_reason
  );

  return v_id;
end;
$$;

revoke all on function private.record_customer_project_procurement_invoice(
  uuid, text, date, numeric, text, numeric, numeric
) from public, anon, authenticated;

revoke all on function private.reverse_customer_project_procurement_invoice_allocation(
  uuid, text
) from public, anon, authenticated;

comment on function private.record_customer_project_procurement_invoice(
  uuid, text, date, numeric, text, numeric, numeric
) is 'A6-F3E bridge: preserves Project Procurement allocation truth while routing Vendor Bill creation/open lifecycle through canonical Finance AP.';

comment on function private.reverse_customer_project_procurement_invoice_allocation(
  uuid, text
) is 'A6-F3E bridge: append-only Project Procurement invoice allocation reversal with mirrored Vendor Bill audit.';
