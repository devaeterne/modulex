-- PB-3A forward guard: Invoice workflow remains available to Sales, but actual
-- customer payment mutation is Finance/Admin-only. Legacy paid_amount remains a
-- compatibility source for existing invoices, not a Sales payment-entry path.

create or replace function private.update_customer_invoice_state(
  p_invoice_id uuid,
  p_status text default null,
  p_paid_amount numeric default null
)
returns text
language plpgsql
security definer
set search_path to 'public', 'private', 'pg_temp'
as $function$
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

  if v_invoice.ledger_managed then
    if p_paid_amount is not null and p_paid_amount is distinct from v_invoice.paid_amount then
      raise exception 'Ledger-managed invoice paid amount is derived from Project payment allocations.' using errcode = '42501';
    end if;
    if p_status in ('partially_paid', 'paid') then
      raise exception 'Ledger-managed invoice payment status is derived from Project payment allocations.' using errcode = '42501';
    end if;
  end if;

  if v_is_sales and not (v_is_admin or v_is_finance) then
    if (p_paid_amount is not null and p_paid_amount is distinct from v_invoice.paid_amount)
       or p_status in ('partially_paid', 'paid') then
      raise exception 'Sales cannot record customer payments. Customer payment mutation is restricted to Finance and Admin.' using errcode = '42501';
    end if;

    if p_status = 'void' and v_invoice.status <> 'void' then
      v_needs_approval := true;
      v_reasons := v_reasons || jsonb_build_array(
        jsonb_build_object('type','invoice_void','label','Voiding an invoice requires approval')
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
$function$;

revoke execute on function private.update_customer_invoice_state(uuid, text, numeric) from public, anon;
grant execute on function private.update_customer_invoice_state(uuid, text, numeric) to authenticated, service_role;
