-- A6-F5A — authenticated public RPC bridge hardening.
-- Private Finance cores remain role-checking SECURITY DEFINER functions with no authenticated EXECUTE.
-- Public wrappers bridge authenticated callers safely with empty search_path.

create or replace function public.record_customer_receipt(
  p_customer_id uuid,
  p_destination_account_id uuid,
  p_amount numeric,
  p_currency_code text,
  p_transaction_at timestamptz,
  p_reference_no text,
  p_notes text,
  p_invoice_allocations jsonb,
  p_manual_fx_rate numeric,
  p_manual_fx_rate_source text,
  p_idempotency_key uuid
)
returns uuid
language sql
security definer
set search_path = ''
as $function$
  select private.record_customer_receipt($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11);
$function$;

create or replace function public.void_customer_receipt(
  p_transaction_id uuid,
  p_reason text,
  p_idempotency_key uuid
)
returns uuid
language sql
security definer
set search_path = ''
as $function$
  select private.void_customer_receipt($1,$2,$3);
$function$;

create or replace function public.reverse_customer_receipt(
  p_transaction_id uuid,
  p_reason text,
  p_idempotency_key uuid
)
returns uuid
language sql
security definer
set search_path = ''
as $function$
  select private.reverse_customer_receipt($1,$2,$3);
$function$;

create or replace function public.link_customer_project_payment_to_finance(
  p_project_payment_transaction_id uuid,
  p_finance_transaction_id uuid
)
returns uuid
language sql
security definer
set search_path = ''
as $function$
  select private.link_customer_project_payment_to_finance($1,$2);
$function$;

create or replace function public.get_customer_receipt_reference_data()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select private.get_customer_receipt_reference_data();
$function$;

create or replace function public.get_customer_receipt_invoices(p_customer_id uuid)
returns table(
  invoice_id uuid,
  invoice_number text,
  order_id uuid,
  project_id uuid,
  status text,
  invoice_date date,
  due_date date,
  currency_code varchar(3),
  total_amount numeric,
  paid_amount numeric,
  balance_amount numeric,
  legacy_unreconciled boolean
)
language sql
stable
security definer
set search_path = ''
as $function$
  select * from private.get_customer_receipt_invoices($1);
$function$;

create or replace function public.get_customer_receipts_page(
  p_limit integer default 50,
  p_offset integer default 0,
  p_customer_id uuid default null,
  p_search text default null
)
returns table(
  transaction_id uuid,
  customer_id uuid,
  customer_code text,
  customer_name text,
  destination_account_id uuid,
  destination_account_name text,
  amount numeric,
  currency_code varchar(3),
  transaction_at timestamptz,
  reference_no text,
  notes text,
  status text,
  allocated_amount numeric,
  invoice_count bigint,
  reversal_transaction_id uuid,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $function$
  select * from private.get_customer_receipts_page($1,$2,$3,$4);
$function$;

revoke all on function public.record_customer_receipt(uuid,uuid,numeric,text,timestamptz,text,text,jsonb,numeric,text,uuid) from public, anon, authenticated;
revoke all on function public.void_customer_receipt(uuid,text,uuid) from public, anon, authenticated;
revoke all on function public.reverse_customer_receipt(uuid,text,uuid) from public, anon, authenticated;
revoke all on function public.link_customer_project_payment_to_finance(uuid,uuid) from public, anon, authenticated;
revoke all on function public.get_customer_receipt_reference_data() from public, anon, authenticated;
revoke all on function public.get_customer_receipt_invoices(uuid) from public, anon, authenticated;
revoke all on function public.get_customer_receipts_page(integer,integer,uuid,text) from public, anon, authenticated;

grant execute on function public.record_customer_receipt(uuid,uuid,numeric,text,timestamptz,text,text,jsonb,numeric,text,uuid) to authenticated;
grant execute on function public.void_customer_receipt(uuid,text,uuid) to authenticated;
grant execute on function public.reverse_customer_receipt(uuid,text,uuid) to authenticated;
grant execute on function public.link_customer_project_payment_to_finance(uuid,uuid) to authenticated;
grant execute on function public.get_customer_receipt_reference_data() to authenticated;
grant execute on function public.get_customer_receipt_invoices(uuid) to authenticated;
grant execute on function public.get_customer_receipts_page(integer,integer,uuid,text) to authenticated;
