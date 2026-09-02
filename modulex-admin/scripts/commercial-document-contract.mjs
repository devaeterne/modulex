import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const exists = (relative) => fs.existsSync(path.join(root, relative));
const failures = [];

function expect(condition, message) {
  if (!condition) failures.push(message);
}

const logoFields = [
  "primary_logo_on_light_url",
  "primary_logo_on_dark_url",
  "secondary_logo_on_light_url",
  "secondary_logo_on_dark_url",
];

const settingsTypes = read("src/lib/settings/types.ts");
for (const field of logoFields) {
  expect(settingsTypes.includes(field), `GeneralSettings must expose ${field}`);
}

expect(exists("src/components/documents/CommercialDocument.tsx"), "Shared CommercialDocument component is required");
expect(exists("src/lib/documents/types.ts"), "Shared commercial document types are required");
expect(exists("src/lib/documents/pdf.ts"), "Direct PDF generator is required");
expect(exists("src/components/settings/DocumentBrandingSettings.tsx"), "Company logo variant settings UI is required");
expect(exists("src/lib/customers/countertop-summary.ts"), "Shared Countertop summary loader/formatter is required");
expect(exists("src/app/(print)/customers/[id]/orders/[orderId]/print/page.tsx"), "Order print route must use the clean print route group");
expect(exists("src/app/(print)/customers/[id]/invoices/[invoiceId]/print/page.tsx"), "Invoice print route must use the clean print route group");
expect(!exists("src/app/(admin)/customers/[id]/invoices/[invoiceId]/print/page.tsx"), "Invoice print route must not render inside the Admin shell");

if (exists("src/lib/customers/countertop-summary.ts")) {
  const countertopSummary = read("src/lib/customers/countertop-summary.ts");
  expect(countertopSummary.includes("export async function loadCountertopLineSummaries"), "Countertop summary module must expose the shared snapshot loader");
  expect(countertopSummary.includes("export function formatCountertopPrintDetail"), "Countertop summary module must expose commercial-document formatting");
  for (const token of ["Material:", "Area:", "Band:", "Edge:", "Sink:", "Services:"]) {
    expect(countertopSummary.includes(token), `Countertop print detail must support ${token}`);
  }
}

if (exists("src/components/documents/CommercialDocument.tsx")) {
  const component = read("src/components/documents/CommercialDocument.tsx");
  expect(component.includes("Print"), "CommercialDocument must expose Print");
  expect(component.includes("Download PDF"), "CommercialDocument must expose Download PDF");
  expect(component.includes("print:"), "CommercialDocument must contain print-specific styling");
  expect(component.includes("ADMIN_DOCUMENT_STYLES"), "CommercialDocument must use shared dark/light document appearance tokens");
  expect(component.includes("primary_logo_on_light_url"), "A4 renderer must use the primary on-light logo slot");
  expect(component.includes("secondary_logo_on_light_url"), "A4 renderer must use the secondary on-light logo slot");
  expect(component.includes("whitespace-pre-line"), "CommercialDocument must preserve multi-line Countertop detail text");
  expect(component.includes("commercial-document-secondary-logo"), "CommercialDocument must give Logo 2 a dedicated normalized visual box");
}

const adminTheme = read("src/components/ui/theme/adminTheme.ts");
expect(adminTheme.includes("ADMIN_DOCUMENT_STYLES"), "Shared document appearance tokens must exist");
expect(adminTheme.includes("dark:bg-gray-950"), "Document viewer theme must support dark mode");
expect(adminTheme.includes("dark:bg-white"), "A4 sheet must remain white in dark mode");

for (const wrapper of [
  "src/components/customers/CustomerOrderPrint.tsx",
  "src/components/customers/CustomerInvoicePrint.tsx",
]) {
  const source = read(wrapper);
  expect(source.includes("CommercialDocument"), `${wrapper} must use the shared CommercialDocument renderer`);
  expect(source.includes("loadCountertopLineSummaries"), `${wrapper} must load saved Countertop configuration snapshots`);
  expect(source.includes("formatCountertopPrintDetail"), `${wrapper} must map Countertop snapshots into printable detail text`);
}

const invoicePrint = read("src/components/customers/CustomerInvoicePrint.tsx");
expect(invoicePrint.includes("order_item_id"), "Invoice print must link Countertop details through immutable order_item_id snapshots");

const orderDomain = read("src/lib/customers/order-domain.ts");
expect(orderDomain.includes('from "@/lib/customers/countertop-summary"'), "Order domain must reuse the shared Countertop summary loader");

const companyPage = read("src/app/(admin)/settings/general/company/page.tsx");
const documentsPage = read("src/app/(admin)/settings/general/documents/page.tsx");
expect(companyPage.includes("DocumentBrandingSettings"), "General > Company must render Logo 1 / Logo 2 variant settings");
expect(!documentsPage.includes("DocumentBrandingSettings"), "General > Documents must not duplicate company-owned logo settings");

if (exists("src/components/settings/DocumentBrandingSettings.tsx")) {
  const branding = read("src/components/settings/DocumentBrandingSettings.tsx");
  expect(!/<button\b/.test(branding), "Logo variant settings must use the shared Button primitive");
  expect(branding.includes('title: "Logo 1"'), "Branding UI must expose Logo 1");
  expect(branding.includes('title: "Logo 2"'), "Branding UI must expose Logo 2");
  expect(branding.includes("on light"), "Branding UI must expose a light-background variant");
  expect(branding.includes("on dark"), "Branding UI must expose a dark-background variant");
  expect(branding.includes("ADMIN_BRANDING_STYLES"), "Branding UI must use shared dark/light appearance tokens");
}

if (exists("src/lib/documents/pdf.ts")) {
  const pdf = read("src/lib/documents/pdf.ts");
  expect(pdf.includes("%PDF-1.4"), "PDF generator must emit a real PDF document");
  expect(pdf.includes("application/pdf"), "PDF generator must return application/pdf");
  expect(pdf.includes("primary_logo_on_light_url"), "PDF must use the primary on-light logo slot");
  expect(pdf.includes("secondary_logo_on_light_url"), "PDF must use the secondary on-light logo slot");
  expect(pdf.includes("detailRows"), "PDF renderer must preserve multiple wrapped Countertop detail rows");
  expect(pdf.includes("rowHeight"), "PDF pagination must account for variable commercial line height");
  expect(pdf.includes("SECONDARY_LOGO_BOX"), "PDF must use a dedicated normalized Logo 2 box");
}

const canonicalSqlPath = "sql/commercial-document-branding.sql";
const migrationPath = "../modulex-store/supabase/migrations/20260902103000_commercial_document_branding.sql";
expect(exists(canonicalSqlPath), "Canonical Admin commercial document branding SQL is required");
expect(exists(migrationPath), "Shared Supabase migration mirror is required");

for (const sqlPath of [canonicalSqlPath, migrationPath]) {
  if (!exists(sqlPath)) continue;
  const sql = read(sqlPath);
  expect(sql.includes("alter table public.general_settings"), `${sqlPath} must alter public.general_settings`);
  for (const field of logoFields) {
    expect(sql.includes(field), `${sqlPath} must add ${field}`);
  }
}

if (failures.length) {
  console.error("Commercial document contract failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log("Commercial document contract passed.");
