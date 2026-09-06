-- A6-F3D hardening: serialize active schedule capacity checks per Vendor Bill.
-- The canonical Vendor Bill row is the concurrency lock so two simultaneous
-- create/update requests cannot both pass against the same outstanding balance.

create or replace function private.validate_vendor_payment_schedule_context(
  p_vendor_id uuid,p_invoice_id uuid,p_planned_amount numeric,p_currency_code text,
  p_payment_method_id uuid default null,p_source_account_id uuid default null,p_exclude_schedule_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_invoice public.vendor_invoices%rowtype;
  v_vendor public.vendors%rowtype;
  v_method public.payment_methods%rowtype;
  v_account public.finance_accounts%rowtype;
  v_paid numeric;
  v_planned numeric;
  v_outstanding numeric;
begin
  -- FOR UPDATE intentionally serializes schedule-capacity decisions for one bill.
  select * into v_invoice
  from public.vendor_invoices
  where id=p_invoice_id
  for update;

  if v_invoice.id is null or v_invoice.status<>'open' then
    raise exception 'Payment Schedule requires an open canonical Vendor Bill.' using errcode='23514';
  end if;
  if v_invoice.vendor_id is distinct from p_vendor_id then
    raise exception 'Payment Schedule Vendor must match the Vendor Bill.' using errcode='23514';
  end if;
  select * into v_vendor from public.vendors where id=p_vendor_id;
  if v_vendor.id is null or v_vendor.status='inactive' then
    raise exception 'Payment Schedule requires an active canonical Vendor.' using errcode='23514';
  end if;
  if p_planned_amount is null or p_planned_amount<=0 then
    raise exception 'Planned payment amount must be greater than zero.' using errcode='22023';
  end if;
  if upper(btrim(coalesce(p_currency_code,''))) is distinct from v_invoice.currency_code then
    raise exception 'Payment Schedule currency must match the Vendor Bill currency.' using errcode='23514';
  end if;

  if p_payment_method_id is not null then
    select * into v_method from public.payment_methods where id=p_payment_method_id;
    if v_method.id is null or not v_method.is_active then
      raise exception 'Planned Payment Method must be active.' using errcode='23514';
    end if;
  end if;
  if p_source_account_id is not null then
    select * into v_account from public.finance_accounts where id=p_source_account_id;
    if v_account.id is null or not v_account.is_active then
      raise exception 'Planned source Finance account must be active.' using errcode='23514';
    end if;
    if v_account.currency_code is distinct from v_invoice.currency_code then
      raise exception 'Planned source account currency must match the Vendor Bill currency.' using errcode='23514';
    end if;
  end if;

  v_paid:=private.vendor_invoice_paid_amount(p_invoice_id);
  v_outstanding:=greatest(v_invoice.total_amount-v_paid,0);
  v_planned:=private.vendor_invoice_planned_amount(p_invoice_id,p_exclude_schedule_id);
  if p_planned_amount+v_planned>v_outstanding+0.0001 then
    raise exception 'Active Payment Schedule amount cannot exceed the Vendor Bill outstanding balance.' using errcode='23514';
  end if;
end;
$function$;

revoke all on function private.validate_vendor_payment_schedule_context(uuid,uuid,numeric,text,uuid,uuid,uuid)
from public,anon,authenticated,service_role;
