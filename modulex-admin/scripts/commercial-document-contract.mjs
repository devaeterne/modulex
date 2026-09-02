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
expect(exists("src/app/(print)/customers/[id]/orders/[orderId]/print/page.tsx"), "Order print route must use the clean print route group");
expect(exists("src/app/(print)/customers/[id]/invoices/[invoiceId]/print/page.tsx"), "Invoice print route must use the clean print route group");
expect(!exists("src/app/(admin)/customers/[id]/invoices/[invoiceId]/print/page.tsx"), "Invoice print route must not render inside the Admin shell");

if (exists("src/components/documents/CommercialDocument.tsx")) {
  const component = read("src/components/documents/CommercialDocument.tsx");
  expect(component.includes("Print"), "CommercialDocument must expose Print");
  expect(component.includes("Download PDF"), "CommercialDocument must expose Download PDF");
  expect(component.includes("print:"), "CommercialDocument must contain print-specific styling");
  expect(component.includes("ADMIN_DOCUMENT_STYLES"), "CommercialDocument must use shared dark/light document appearance tokens");
  expect(component.includes("primary_logo_on_light_url"), "A4 renderer must use the primary on-light logo slot");
  expect(component.includes("secondary_logo_on_light_url"), "A4 renderer must use the secondary on-light logo slot");
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
}

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
