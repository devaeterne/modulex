-- Modulex RBAC: multi-role alignment for role-sensitive SECURITY DEFINER workflows.
-- These functions must evaluate effective role membership instead of selecting one primary role.

create or replace function private.update_customer_invoice_state(
  p_invoice_id uuid,
  p_status text default null,
  p_paid_amount numeric default null
)
returns text
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_invoice public.customer_invoices%rowtype;
  v_request_id uuid;
  v_reasons jsonb := '[]'::jsonb;
  v_needs_approval boolean := false;
  v_key text;
  v_is_admin boolean;
  v_is_finance boolean;
  v_is_sales boolean;
begin
  v_is_admin := private.current_user_has_any_role(array['super_admin','admin']::text[]);
  v_is_finance := private.current_user_has_any_role(array['finance']::text[]);
  v_is_sales := private.current_user_has_any_role(array['sales']::text[]);

  if not (v_is_admin or v_is_finance or v_is_sales) then
    raise exception 'You do not have permission to update customer invoices.';
  end if;

  select * into v_invoice
  from public.customer_invoices
  where id = p_invoice_id;

  if v_invoice.id is null then
    raise exception 'Invoice not found.';
  end if;

  -- Finance and elevated roles retain direct invoice-management authority.
  -- Sales-only users keep the existing protected-change approval workflow.
  if v_is_sales and not (v_is_admin or v_is_finance) then
    if p_status = 'void' and v_invoice.status <> 'void' then
      v_needs_approval := true;
      v_reasons := v_reasons || jsonb_build_array(
        jsonb_build_object('type','invoice_void','label','Voiding an invoice requires approval')
      );
    end if;

    if p_paid_amount is not null and p_paid_amount < coalesce(v_invoice.paid_amount, 0) then
      v_needs_approval := true;
      v_reasons := v_reasons || jsonb_build_array(
        jsonb_build_object(
          'type','payment_reversal',
          'label','Reducing a recorded paid amount requires approval',
          'current_paid',v_invoice.paid_amount,
          'proposed_paid',p_paid_amount
        )
      );
    end if;

    if v_invoice.status = 'paid' and p_status is not null and p_status <> 'paid' then
      v_needs_approval := true;
      v_reasons := v_reasons || jsonb_build_array(
        jsonb_build_object(
          'type','invoice_status_regression',
          'label','Changing a paid invoice to another status requires approval'
        )
      );
    end if;
  end if;

  if v_needs_approval then
    v_key := md5(
      v_invoice.updated_at::text || ':' || coalesce(p_status, '') || ':' || coalesce(p_paid_amount::text, '')
    );
    v_request_id := private.create_approval_request(
      'invoice_change',
      'invoice',
      p_invoice_id,
      v_invoice.invoice_number,
      'Invoice change requires approval.',
      jsonb_build_object(
        'updated_at',v_invoice.updated_at,
        'status',v_invoice.status,
        'paid_amount',v_invoice.paid_amount
      ),
      jsonb_build_object('status',p_status,'paid_amount',p_paid_amount),
      jsonb_build_object(
        'requires_approval',true,
        'reasons',v_reasons,
        'approval_key',v_key
      ),
      v_key
    );
    return 'approval_requested';
  end if;

  return private.update_customer_invoice_state_core(
    p_invoice_id,
    p_status,
    p_paid_amount
  );
end;
$$;

create or replace function private.get_panel_notification_feed(p_limit integer default 30)
returns table(
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
  v_is_admin boolean;
  v_is_sales boolean;
  v_is_finance boolean;
  v_is_warehouse boolean;
  v_is_shipping boolean;
begin
  v_is_admin := private.current_user_has_any_role(array['super_admin','admin']::text[]);
  v_is_sales := private.current_user_has_any_role(array['sales']::text[]);
  v_is_finance := private.current_user_has_any_role(array['finance']::text[]);
  v_is_warehouse := private.current_user_has_any_role(array['warehouse']::text[]);
  v_is_shipping := private.current_user_has_any_role(array['shipping']::text[]);

  if not (v_is_admin or v_is_sales or v_is_finance or v_is_warehouse or v_is_shipping) then
    raise exception 'Active staff access is required.';
  end if;

  return query
  select
    en.id,
    en.event_type,
    r.label,
    r.severity,
    r.sound_enabled,
    en.entity_type,
    en.entity_id,
    coalesce(o.customer_id, i.customer_id, dc.id) as customer_id,
    coalesce(o.order_number, i.invoice_number, dc.customer_code, sl.reference_code) as reference,
    coalesce(
      c.name,
      nullif(sl.company_name, ''),
      nullif(trim(concat_ws(' ', sl.first_name, sl.last_name)), '')
    ) as customer_name,
    en.payload,
    en.created_at
  from public.email_notifications en
  join public.notification_delivery_rules r
    on r.event_type = en.event_type
   and r.panel_enabled = true
  left join public.customer_orders o
    on en.entity_type = 'order' and o.id = en.entity_id
  left join public.customer_invoices i
    on en.entity_type = 'invoice' and i.id = en.entity_id
  left join public.customers dc
    on en.entity_type = 'customer' and dc.id = en.entity_id
  left join public.store_leads sl
    on en.entity_type = 'store_lead' and sl.id = en.entity_id
  left join public.customers c
    on c.id = coalesce(o.customer_id, i.customer_id, dc.id)
  where en.audience = 'internal'
    and (
      v_is_admin
      or (v_is_sales and (
        en.event_type in (
          'new_order',
          'new_store_lead',
          'order_status_changed',
          'price_review_required',
          'invoice_issued'
        )
        or (
          en.event_type in ('approval_approved','approval_rejected')
          and en.payload->>'requested_by' = auth.uid()::text
        )
      ))
      or (v_is_finance and en.event_type in (
        'new_order',
        'order_status_changed',
        'price_review_required',
        'invoice_issued',
        'approval_requested',
        'approval_approved',
        'approval_rejected'
      ))
      or (v_is_warehouse and en.event_type in ('stock_review_required','order_status_changed'))
      or (v_is_shipping and en.event_type in ('order_status_changed'))
    )
  order by en.created_at desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
end;
$$;
