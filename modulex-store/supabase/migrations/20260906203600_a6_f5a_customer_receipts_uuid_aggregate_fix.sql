-- A6-F5A — Customer Receipts UUID aggregate runtime fix.
-- PostgreSQL does not define max(uuid); preserve the single-customer receipt projection
-- with a UUID-native ordered aggregate instead of casting through text.

create or replace function private.get_customer_receipts_page(
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
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  perform private.finance_assert_view();
  return query
  with receipt_links as (
    select
      t.id,
      (array_agg(distinct l.customer_id order by l.customer_id)
        filter (where l.customer_id is not null))[1] as customer_id,
      coalesce(sum(l.allocated_amount) filter (where l.source_document_type='customer_invoice'),0)::numeric as allocated_amount,
      count(distinct l.source_document_id) filter (where l.source_document_type='customer_invoice') as invoice_count
    from public.finance_transactions t
    left join public.finance_transaction_links l on l.transaction_id=t.id
    where t.transaction_kind='customer_receipt'
    group by t.id
  )
  select
    t.id,
    rl.customer_id,
    c.customer_code,
    c.name,
    t.destination_account_id,
    a.name,
    t.amount,
    t.currency_code,
    t.transaction_at,
    t.reference_no,
    t.notes,
    t.status,
    rl.allocated_amount,
    rl.invoice_count,
    (
      select r.id from public.finance_transactions r
      where r.reversal_of_transaction_id=t.id and r.status='posted'
      order by r.posted_at desc nulls last limit 1
    ),
    count(*) over()
  from public.finance_transactions t
  join receipt_links rl on rl.id=t.id
  left join public.customers c on c.id=rl.customer_id
  left join public.finance_accounts a on a.id=t.destination_account_id
  where t.transaction_kind='customer_receipt'
    and (p_customer_id is null or rl.customer_id=p_customer_id)
    and (
      nullif(btrim(coalesce(p_search,'')),'') is null
      or coalesce(c.name,'') ilike '%' || btrim(p_search) || '%'
      or coalesce(c.customer_code,'') ilike '%' || btrim(p_search) || '%'
      or coalesce(t.reference_no,'') ilike '%' || btrim(p_search) || '%'
    )
  order by t.transaction_at desc, t.created_at desc
  limit least(greatest(coalesce(p_limit,50),1),200)
  offset greatest(coalesce(p_offset,0),0);
end;
$function$;

revoke all on function private.get_customer_receipts_page(integer,integer,uuid,text) from public, anon, authenticated;
