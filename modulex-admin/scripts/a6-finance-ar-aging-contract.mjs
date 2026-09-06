import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.existsSync(path.join(root, file)) ? fs.readFileSync(path.join(root, file), "utf8") : "";
const exists = (file) => fs.existsSync(path.join(root, file));
const expect = (ok, message) => { if (!ok) throw new Error(message); };
const functionBlock = (source, qualifiedName) => {
  const start = source.indexOf(`create or replace function ${qualifiedName}`);
  if (start < 0) return "";
  const next = source.indexOf("create or replace function ", start + 1);
  return source.slice(start, next < 0 ? source.length : next);
};

const sqlPath = "sql/a6-finance-ar-aging.sql";
const migrationDir = path.join(root, "../modulex-store/supabase/migrations");
const migrationMatches = fs.existsSync(migrationDir)
  ? fs.readdirSync(migrationDir).filter((name) => name.endsWith("_a6_finance_ar_aging.sql"))
  : [];

expect(exists(sqlPath), "Missing A6-F5B Admin SQL: sql/a6-finance-ar-aging.sql");
expect(migrationMatches.length === 1, `A6-F5B must have exactly one canonical Store migration mirror; found ${migrationMatches.length}`);
const migrationPath = `../modulex-store/supabase/migrations/${migrationMatches[0]}`;
const sql = read(sqlPath);
const migration = read(migrationPath);
expect(sql === migration, "A6-F5B Admin SQL and Store migration mirror must stay byte-identical");

expect(!/create\s+table/i.test(sql), "F5B is read-model only and must not create a parallel AR balance ledger");
expect(!/insert\s+into\s+public\./i.test(sql), "F5B read models must not manufacture Finance or AR history");
expect(!/update\s+public\.customer_invoices/i.test(sql), "F5B read models must not become a second Invoice settlement truth");
expect(!/delete\s+from\s+public\./i.test(sql), "F5B read models must not delete canonical source history");

const privateRpcs = [
  "get_ar_aging_page",
  "get_ar_aging_summary",
  "get_customer_balances_page",
  "get_customer_invoice_balance_page",
  "get_customer_payment_history_page",
];
for (const rpc of privateRpcs) {
  const block = functionBlock(sql, `private.${rpc}`);
  expect(block.length > 0, `Missing private.${rpc}`);
  expect(/finance_assert_view/i.test(block), `private.${rpc} must enforce finance.view`);
  expect(/security\s+definer/i.test(block), `private.${rpc} must be SECURITY DEFINER`);
  expect(/set\s+search_path\s*=\s*''/i.test(block), `private.${rpc} must pin an empty search_path`);

  const publicBlock = functionBlock(sql, `public.${rpc}`);
  expect(publicBlock.length > 0, `Missing public.${rpc}`);
  expect(/security\s+definer/i.test(publicBlock), `public.${rpc} must bridge authenticated callers with SECURITY DEFINER`);
  expect(/set\s+search_path\s*=\s*''/i.test(publicBlock), `public.${rpc} must pin an empty search_path`);
}
expect(/create\s+or\s+replace\s+function\s+private\.ar_aging_invoice_projection\s*\(/i.test(sql), "F5B must expose one canonical Invoice AR projection core");
expect(/finance_assert_view/i.test(functionBlock(sql, "private.ar_aging_invoice_projection")), "AR projection must enforce finance.view");
expect(/revoke\s+all\s+on\s+function\s+private\./i.test(sql), "F5B private cores must remain revoked from browser roles");
for (const rpc of privateRpcs) {
  expect(new RegExp(`revoke\\s+all\\s+on\\s+function\\s+public\\.${rpc}\\([^;]*\\)\\s+from\\s+public\\s*,\\s*anon`, "i").test(sql), `public.${rpc} must revoke PUBLIC/anon execute`);
  expect(new RegExp(`grant\\s+execute\\s+on\\s+function\\s+public\\.${rpc}\\([^;]*\\)\\s+to\\s+authenticated`, "i").test(sql), `public.${rpc} must grant authenticated execute explicitly`);
}

for (const source of [
  "customer_invoices",
  "customers",
  "customer_orders",
  "finance_transactions",
  "finance_transaction_links",
  "customer_project_payment_transactions",
  "customer_project_payment_allocations",
  "customer_project_payment_requirements",
  "customer_project_payment_finance_links",
]) expect(sql.includes(source), `F5B must reconcile canonical ${source} truth`);

const projection = functionBlock(sql, "private.ar_aging_invoice_projection");
expect(/transaction_kind\s*=\s*'customer_receipt'/i.test(projection), "AR Invoice paid amount must include canonical posted Customer Receipts");
expect(/transaction_kind\s*=\s*'reversal'|reversal_of_transaction_id/i.test(projection), "AR Invoice paid amount must account for Finance receipt reversals");
expect(/tx\.status\s*=\s*'posted'/i.test(projection), "AR Invoice settlement must count posted Finance movement only");
expect(/project_payment_sign/i.test(projection), "AR Invoice settlement must preserve unbridged Project payment compatibility until F5C");
expect(/not\s+exists[\s\S]{0,600}customer_project_payment_finance_links/i.test(projection), "AR Invoice settlement must exclude Finance-bridged Project payments from the Project component");
expect(/greatest[\s\S]{0,200}least/i.test(projection), "AR paid/outstanding projection must clamp reconciled settlement safely");
expect(/status\s*(?:<>|!=)\s*'void'|status\s+not\s+in\s*\([^)]*'void'/i.test(projection), "Voided Invoices must not become receivables");

expect(/due_date\s+is\s+null\s+or[\s\S]{0,120}due_date\s*>=\s*v_as_of[\s\S]{0,100}'current'/i.test(projection), "Current AR bucket must include not-due or undated receivables");
expect(/v_as_of\s*-\s*[a-z0-9_.]*due_date\s*<=\s*30[\s\S]{0,80}'1_30'/i.test(projection), "1–30 AR bucket boundary must be explicit");
expect(/v_as_of\s*-\s*[a-z0-9_.]*due_date\s*<=\s*60[\s\S]{0,80}'31_60'/i.test(projection), "31–60 AR bucket boundary must be explicit");
expect(/v_as_of\s*-\s*[a-z0-9_.]*due_date\s*<=\s*90[\s\S]{0,80}'61_90'/i.test(projection), "61–90 AR bucket boundary must be explicit");
expect(/else\s+'90_plus'/i.test(projection), "90+ AR bucket boundary must be explicit");

expect(/finance_base_currency/i.test(sql), "F5B reporting must reuse the canonical Finance base currency");
expect(/unconverted/i.test(sql), "F5B must surface unresolved Invoice FX instead of silently converting or zeroing it");
expect(/when\s+[a-z0-9_.]*currency_code\s*=\s*v_base[\s\S]{0,220}else\s+null/i.test(projection), "Invoice base outstanding may only be populated without a stored FX snapshot when Invoice currency already equals Finance base currency");

const agingPage = functionBlock(sql, "private.get_ar_aging_page");
expect(/p_bucket/i.test(agingPage) && /current/i.test(agingPage) && /90_plus/i.test(agingPage), "AR Aging page must validate/filter canonical aging buckets");
expect(/p_limit/i.test(agingPage) && /p_offset/i.test(agingPage) && /count\(\*\)\s+over\s*\(\)/i.test(agingPage), "AR Aging page must implement server pagination with total_count");
expect(/p_customer_id/i.test(agingPage) && /p_search/i.test(agingPage), "AR Aging page must support Customer and search filters");

const balancePage = functionBlock(sql, "private.get_customer_balances_page");
for (const term of ["open_invoice_count", "overdue_invoice_count", "partial_invoice_count", "paid_invoice_count", "outstanding", "unconverted"]) {
  expect(balancePage.toLowerCase().includes(term), `Customer Balance projection must expose ${term}`);
}
expect(/count\(\*\)\s+over\s*\(\)/i.test(balancePage), "Customer Balance page must expose total_count for pagination");

const invoicePage = functionBlock(sql, "private.get_customer_invoice_balance_page");
expect(/p_customer_id/i.test(invoicePage), "Invoice balance drill-down must be Customer-scoped");
expect(/p_balance_state/i.test(invoicePage), "Invoice balance drill-down must filter open/paid/all states");
expect(/paid/i.test(invoicePage) && /outstanding/i.test(invoicePage), "Invoice balance drill-down must expose both paid and outstanding projections");
expect(/count\(\*\)\s+over\s*\(\)/i.test(invoicePage), "Invoice balance drill-down must paginate server-side");

const history = functionBlock(sql, "private.get_customer_payment_history_page");
expect(/customer_receipt/i.test(history), "Customer Payment History must be built from canonical Customer Receipts");
expect(/reversal/i.test(history), "Customer Payment History must expose receipt corrections/reversals");
expect(/t\.status/i.test(history) && !/t\.status\s*=\s*'posted'/i.test(history), "Customer Payment History must preserve voided/non-posted receipt status history instead of filtering to posted only");
expect(/base_amount/i.test(history) && /base_currency_code/i.test(history), "Customer Payment History must use stored Finance transaction-time base/FX snapshots");
expect(/customer_project_payment_finance_links/i.test(history), "Customer Payment History may expose Project bridge attribution for a canonical Finance receipt");
expect(!/union[\s\S]{0,400}customer_project_payment_transactions/i.test(history), "Customer Payment History must not double-count Project payment rows as a second cash ledger");
expect(/count\(\*\)\s+over\s*\(\)/i.test(history), "Customer Payment History must paginate server-side");
expect(/p_customer_id/i.test(history) && /p_search/i.test(history), "Customer Payment History must support Customer/search filters");

const route = "src/app/(admin)/finance/ar-aging/page.tsx";
const manager = "src/components/finance/FinanceArAgingManager.tsx";
const adapter = "src/lib/finance/arAging.ts";
for (const file of [route, manager, adapter]) expect(exists(file), `Missing A6-F5B Admin surface: ${file}`);
const routeSource = read(route);
const ui = read(manager);
const domain = read(adapter);
expect(routeSource.includes("PageBreadCrumb") && routeSource.includes("FinanceArAgingManager"), "AR route must use shared breadcrumb and dedicated manager");
for (const rpc of ["get_ar_aging_page", "get_ar_aging_summary", "get_customer_balances_page", "get_customer_invoice_balance_page", "get_customer_payment_history_page"]) {
  expect(domain.includes(`supabase.rpc(\"${rpc}\"`) || domain.includes(`supabase.rpc("${rpc}"`), `AR adapter must call ${rpc}`);
}
for (const primitive of ["ComponentCard", "Alert", "Badge", "Button", "Select", "TableViewport", "TableStateRow"]) {
  expect(ui.includes(primitive), `AR UI must reuse shared ${primitive}`);
}
for (const term of ["AR Aging", "Customer Balance", "Payment History", "Outstanding", "Overdue", "Current", "1–30", "31–60", "61–90", "90+"]) {
  expect(ui.toLowerCase().includes(term.toLowerCase()), `AR UI must expose ${term}`);
}
expect(!/<(?:input|select|button)\b/.test(ui), "AR UI must not render native form controls directly");

const sidebar = read("src/layout/AppSidebar.tsx");
expect(/name:\s*"AR Aging"[\s\S]{0,120}path:\s*"\/finance\/ar-aging"[\s\S]{0,120}permission:\s*"finance\.view"/.test(sidebar), "Finance sidebar must expose AR Aging under finance.view");
const overview = read("src/components/finance/FinanceOverview.tsx");
expect(overview.includes("/finance/ar-aging"), "Finance Overview must link to AR Aging without adding a parallel report hub");

console.log("A6-F5B AR Aging / Customer Balance / Payment History contract: PASS");
