-- A6-F3B hardening: draft removal preserves AP history instead of deleting the source document.

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

revoke all on function private.delete_vendor_invoice_draft(uuid) from public, anon, authenticated, service_role;
