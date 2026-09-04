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
]) {
  expect(sql.includes(`function ${fn}`), `A6-F1 hardening must define ${fn}`);
}

expect(sql.includes("where id=p_transaction_id and status='draft' for update"), "Draft delete must lock and prove the transaction is still draft");
expect(sql.includes("delete from public.finance_transaction_links where transaction_id=p_transaction_id"), "Draft delete must remove draft attribution links atomically");
expect(sql.includes("delete from public.finance_transaction_audit where transaction_id=p_transaction_id"), "Draft delete must remove draft-only audit rows before deleting the draft");
expect(sql.includes("delete from public.finance_idempotency_requests where result_transaction_id=p_transaction_id"), "Draft delete must remove draft-only idempotency rows before deleting the draft");
expect(sql.includes("delete from public.finance_transactions where id=p_transaction_id and status='draft'"), "Draft delete must never hard-delete posted/voided Finance history");

expect(sql.includes("new.status = 'draft' and new.transaction_kind <> 'reversal' and not v_source.is_active"), "Inactive source accounts must block ordinary drafts, not historical void/reversal corrections");
expect(sql.includes("new.status = 'draft' and new.transaction_kind <> 'reversal' and not v_destination.is_active"), "Inactive destination accounts must block ordinary drafts, not historical void/reversal corrections");
expect(sql.includes("new.status = 'draft' and new.transaction_kind <> 'reversal' and not v_category.is_active"), "Inactive categories must block ordinary drafts, not historical void/reversal corrections");

expect(sql.includes("revoke all on function public.delete_finance_transaction_draft(uuid) from public,anon"), "Draft delete RPC must not be public/anon executable");
expect(sql.includes("grant execute on function public.delete_finance_transaction_draft(uuid) to authenticated"), "Draft delete RPC must be authenticated-only");
expect(sql.includes("revoke all on function private.delete_finance_transaction_draft(uuid) from public,anon,authenticated"), "Draft delete private core must not be executable by app roles");

expect(core.includes("export async function deleteFinanceTransactionDraft"), "Finance adapter must expose guarded draft delete RPC");
expect(core.includes('supabase.rpc("delete_finance_transaction_draft"'), "Finance adapter must call delete_finance_transaction_draft RPC");
expect(manager.includes("deleteFinanceTransactionDraft"), "Finance Transactions UI must wire draft delete");
expect(manager.includes('transaction.status === "draft"'), "Finance Transactions UI must expose delete only for draft rows");
expect(manager.includes("Delete Draft"), "Finance Transactions UI must label the destructive draft action clearly");

console.log("A6-F1 Finance Core hardening contract passed.");
