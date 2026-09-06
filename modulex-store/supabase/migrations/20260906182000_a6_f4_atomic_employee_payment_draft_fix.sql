-- A6 F4 corrective migration: align atomic Employee Payment draft creation with the
-- canonical Finance Core draft function signature.
-- The original F4 hardening migration passed one obsolete/nonexistent NULL argument.

create or replace function private.save_employee_payment_draft(
  p_source_account_id uuid,
  p_amount numeric,
  p_currency_code text,
  p_transaction_at timestamptz,
  p_reference_no text,
  p_notes text,
  p_employee_id uuid,
  p_source_document_type text,
  p_source_document_id uuid,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_id uuid;
  v_existing uuid;
  v_fingerprint text;
begin
  perform private.finance_assert_manage();

  if p_employee_id is null then
    raise exception 'Employee is required for an employee payment.' using errcode = '22023';
  end if;
  if p_idempotency_key is null then
    raise exception 'Employee payment idempotency key is required.' using errcode = '22023';
  end if;

  v_fingerprint := md5(jsonb_build_object(
    'source_account_id', p_source_account_id,
    'amount', p_amount,
    'currency_code', upper(btrim(coalesce(p_currency_code,''))),
    'transaction_at', p_transaction_at,
    'reference_no', nullif(btrim(coalesce(p_reference_no,'')),''),
    'notes', nullif(btrim(coalesce(p_notes,'')),''),
    'employee_id', p_employee_id,
    'source_document_type', nullif(btrim(coalesce(p_source_document_type,'')),''),
    'source_document_id', p_source_document_id
  )::text);

  v_existing := private.finance_idempotency_existing('employee_payment_draft', p_idempotency_key, v_fingerprint);
  if v_existing is not null then
    return v_existing;
  end if;

  v_id := private.create_finance_transaction_draft(
    'employee_payment',
    p_source_account_id,
    null,
    null,
    p_amount,
    p_currency_code,
    p_transaction_at,
    p_reference_no,
    p_notes,
    p_idempotency_key
  );

  perform private.set_finance_transaction_links(v_id, jsonb_build_array(jsonb_build_object(
    'employee_id', p_employee_id,
    'source_document_type', nullif(btrim(coalesce(p_source_document_type,'')),''),
    'source_document_id', p_source_document_id,
    'allocated_amount', p_amount
  )));

  perform private.finance_store_idempotency('employee_payment_draft', p_idempotency_key, v_fingerprint, v_id);
  return v_id;
end;
$function$;

revoke all on function private.save_employee_payment_draft(uuid,numeric,text,timestamptz,text,text,uuid,text,uuid,uuid) from public,anon,authenticated;

notify pgrst, 'reload schema';
