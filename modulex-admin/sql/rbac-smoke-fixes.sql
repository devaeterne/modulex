-- RBAC smoke-test fixes applied to production Supabase.
-- 1) Finance may use the protected invoice state RPC.
-- 2) Shipping may execute shipment RPCs but not general stock operations.

create or replace function private.update_customer_invoice_state_core(
  p_invoice_id uuid,
  p_status text default null,
  p_paid_amount numeric default null
)
returns text
language plpgsql
set search_path to 'public'
as $function$
declare
  v_invoice public.customer_invoices%rowtype;
  v_status text;
  v_paid numeric(18,4);
begin
  if not public.current_user_has_any_role(array['super_admin', 'admin', 'sales', 'finance']) then
    raise exception 'You do not have permission to update customer invoices.';
  end if;

  select * into v_invoice
  from public.customer_invoices
  where id = p_invoice_id
  for update;

  if v_invoice.id is null then
    raise exception 'Invoice not found.';
  end if;

  if v_invoice.status = 'void' and coalesce(p_status, 'void') <> 'void' then
    raise exception 'A void invoice cannot be reactivated.';
  end if;

  v_paid := coalesce(p_paid_amount, v_invoice.paid_amount);
  if v_paid < 0 or v_paid > v_invoice.total_amount then
    raise exception 'Paid amount must be between zero and invoice total.';
  end if;

  v_status := coalesce(p_status,
    case
      when v_paid = 0 then v_invoice.status
      when v_paid >= v_invoice.total_amount then 'paid'
      else 'partially_paid'
    end
  );

  if v_status not in ('draft', 'issued', 'partially_paid', 'paid', 'overdue', 'void') then
    raise exception 'Invalid invoice status.';
  end if;

  if v_status = 'draft' and v_invoice.issued_at is not null then
    raise exception 'An issued invoice cannot return to draft.';
  end if;

  if v_status in ('partially_paid', 'paid') and v_invoice.issued_at is null then
    raise exception 'Issue the invoice before recording payment.';
  end if;

  if v_status = 'paid' then
    v_paid := v_invoice.total_amount;
  end if;

  update public.customer_invoices
  set
    status = v_status,
    paid_amount = v_paid,
    issued_at = case
      when v_status in ('issued', 'partially_paid', 'paid', 'overdue') and issued_at is null then now()
      else issued_at
    end,
    paid_at = case when v_status = 'paid' then coalesce(paid_at, now()) else null end,
    voided_at = case when v_status = 'void' then coalesce(voided_at, now()) else null end
  where id = p_invoice_id;

  return v_status;
end;
$function$;

create or replace function public.can_operate_stock()
returns boolean
language sql
stable
set search_path to 'private'
as $function$
  select private.has_role(array['super_admin','admin','warehouse']::public.user_role[]);
$function$;
