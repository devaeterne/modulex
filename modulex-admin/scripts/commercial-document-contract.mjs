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

const settingsTypes = read("src/lib/settings/types.ts");
for (const field of [
  "primary_logo_on_light_url",
  "primary_logo_on_dark_url",
  "secondary_logo_on_light_url",
  "secondary_logo_on_dark_url",
]) {
  expect(settingsTypes.includes(field), `GeneralSettings must expose ${field}`);
}

expect(exists("src/components/documents/CommercialDocument.tsx"), "Shared CommercialDocument component is required");
expect(exists("src/lib/documents/types.ts"), "Shared commercial document types are required");
expect(exists("src/lib/documents/pdf.ts"), "Direct PDF generator is required");
expect(exists("src/components/settings/DocumentBrandingSettings.tsx"), "Document branding settings UI is required");

if (exists("src/components/documents/CommercialDocument.tsx")) {
  const component = read("src/components/documents/CommercialDocument.tsx");
  expect(component.includes("Print"), "CommercialDocument must expose Print");
  expect(component.includes("Download PDF"), "CommercialDocument must expose Download PDF");
  expect(component.includes("dark:"), "Commercial document viewer must support dark theme chrome");
  expect(component.includes("print:"), "CommercialDocument must contain print-specific styling");
}

for (const wrapper of [
  "src/components/customers/CustomerOrderPrint.tsx",
  "src/components/customers/CustomerInvoicePrint.tsx",
]) {
  const source = read(wrapper);
  expect(source.includes("CommercialDocument"), `${wrapper} must use the shared CommercialDocument renderer`);
}

const documentsPage = read("src/app/(admin)/settings/general/documents/page.tsx");
expect(documentsPage.includes("DocumentBrandingSettings"), "General > Documents must render branding settings");

if (exists("src/components/settings/DocumentBrandingSettings.tsx")) {
  const branding = read("src/components/settings/DocumentBrandingSettings.tsx");
  expect(!/<button\b/.test(branding), "DocumentBrandingSettings must use the shared Button primitive");
  expect(branding.includes("on light"), "Branding UI must explain light-background logo slots");
  expect(branding.includes("on dark"), "Branding UI must explain dark-background logo slots");
}

if (exists("src/lib/documents/pdf.ts")) {
  const pdf = read("src/lib/documents/pdf.ts");
  expect(pdf.includes("%PDF-1.4"), "PDF generator must emit a real PDF document");
  expect(pdf.includes("application/pdf"), "PDF generator must return application/pdf");
}

if (failures.length) {
  console.error("Commercial document contract failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log("Commercial document contract passed.");
