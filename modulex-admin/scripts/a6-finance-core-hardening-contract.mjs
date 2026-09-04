import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));
const expect = (ok, message) => { if (!ok) throw new Error(message); };

const adminSqlPath = "sql/a6-finance-core-hardening.sql";
const migrationPath = "../modulex-store/supabase/migrations/20260904121000_a6_finance_core_hardening.sql";
const corePath = "src/lib/finance/core.ts";
const managerPath = "src/components/finance/FinanceTransactionsManager.tsx";

expect(exists(adminSqlPath), "A6-F1 hardening Admin SQL must exist");
expect(exists(migrationPath), "A6-F1 hardening Supabase migration mirror must exist");

const sql = read(adminSqlPath);
const migration = read(migrationPath);
const core = read(corePath);
const manager = read(managerPath);

expect(sql === migration, "A6-F1 hardening Admin SQL and Supabase migration must stay byte-identical");

for (const fn of [
  "private.delete_finance_transaction_draft",
  "public.delete_finance_transaction_draft",
  "private.validate_finance_transaction_link_context",
]) {
  expect(sql.includes(`function ${fn}`), `A6-F1 hardening must define ${fn}`);
}

expect(sql.includes("where id=p_transaction_id and status='draft' for update"), "Draft delete must lock and prove the transaction is still draft");
expect(sql.includes("delete from public.finance_transaction_links where transaction_id=p_transaction_id"), "Draft delete must remove draft attribution links atomically");
expect(sql.includes("delete from public.finance_transaction_audit where transaction_id=p_transaction_id"), "Draft delete must remove draft-only audit rows before deleting the draft");
expect(sql.includes("delete from public.finance_idempotency_requests where result_transaction_id=p_transaction_id"), "Draft delete must remove draft-only idempotency rows before deleting the draft");
expect(sql.includes("delete from public.finance_transactions where id=p_transaction_id and status='draft'"), "Draft delete must never hard-delete posted/voided Finance history");
expect(sql.includes("modulex.finance_draft_delete"), "Draft-only append-safe cleanup must use an explicit transaction-local guard");

expect(sql.includes("v_allow_inactive_history := new.transaction_kind = 'reversal'"), "Reversal corrections must tolerate historical inactive Finance dimensions");
expect(sql.includes("old.status = 'posted' and new.status = 'voided'"), "Posted-to-voided correction must tolerate historical inactive Finance dimensions");
expect(sql.includes("not v_source.is_active and not v_allow_inactive_history"), "Inactive source accounts must still block ordinary draft/post activity");
expect(sql.includes("not v_destination.is_active and not v_allow_inactive_history"), "Inactive destination accounts must still block ordinary draft/post activity");
expect(sql.includes("not v_category.is_active and not v_allow_inactive_history"), "Inactive categories must still block ordinary draft/post activity");

expect(sql.includes("v_allocated_total"), "Transaction validation must account for existing attribution allocations");
expect(sql.includes("where l.transaction_id = new.id"), "Changing a Finance transaction amount must reconcile its existing allocations");
expect(sql.includes("v_allocated_total > new.amount"), "Finance transaction amount cannot be reduced below allocated total");
expect(sql.includes("v_order_customer"), "Finance link validation must resolve the canonical Order customer");
expect(sql.includes("new.customer_id is not null and v_order_customer is distinct from new.customer_id"), "Order + Customer Finance attribution must fail closed when the relationship does not match");
expect(sql.includes("v_other_allocated + new.allocated_amount > v_transaction.amount"), "Row-level Finance attribution writes must not make total allocation exceed transaction amount");
expect(sql.includes("trg_validate_finance_transaction_link_context"), "Finance attribution consistency must be protected by a DB trigger, not only the RPC loop");

const mutationWrappers = [
  "create_finance_account",
  "update_finance_account",
  "create_finance_category",
  "upsert_finance_fx_rate",
  "create_finance_transaction_draft",
  "update_finance_transaction_draft",
  "set_finance_transaction_links",
  "post_finance_transaction",
  "void_finance_transaction",
  "reverse_finance_transaction",
  "delete_finance_transaction_draft",
];
for (const fn of mutationWrappers) {
  const start = sql.indexOf(`create or replace function public.${fn}`);
  expect(start >= 0, `Hardening SQL must redefine public.${fn}`);
  const end = sql.indexOf("$function$;", start);
  expect(end > start, `Hardening SQL must contain a complete wrapper body for public.${fn}`);
  const definition = sql.slice(start, end);
  expect(definition.includes("security definer"), `public.${fn} must be SECURITY DEFINER so authenticated callers cannot execute private cores directly`);
  expect(definition.includes("set search_path = ''"), `public.${fn} must use a locked search_path`);
}

expect(sql.includes("revoke all on function public.delete_finance_transaction_draft(uuid) from public,anon"), "Draft delete RPC must not be public/anon executable");
expect(sql.includes("grant execute on function public.delete_finance_transaction_draft(uuid) to authenticated"), "Draft delete RPC must be authenticated-only");
expect(sql.includes("revoke all on function private.delete_finance_transaction_draft(uuid) from public,anon,authenticated"), "Draft delete private core must not be executable by app roles");
expect(sql.includes("revoke all on function private.validate_finance_transaction_link_context() from public,anon,authenticated"), "Finance link validation trigger function must not be executable by app roles");

expect(core.includes("export async function deleteFinanceTransactionDraft"), "Finance adapter must expose guarded draft delete RPC");
expect(core.includes('supabase.rpc("delete_finance_transaction_draft"'), "Finance adapter must call delete_finance_transaction_draft RPC");
expect(manager.includes("deleteFinanceTransactionDraft"), "Finance Transactions UI must wire draft delete");
expect(manager.includes('transaction.status === "draft"'), "Finance Transactions UI must expose delete only for draft rows");
expect(manager.includes("Delete Draft"), "Finance Transactions UI must label the destructive draft action clearly");

console.log("A6-F1 Finance Core hardening contract passed.");
