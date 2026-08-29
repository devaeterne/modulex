import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const sidebar = read("src/layout/AppSidebar.tsx");
const page = read("src/app/(admin)/store/company/page.tsx");
const manager = read("src/components/store/StoreCompanyManager.tsx");

assert.match(sidebar, /name:\s*"Company"[\s\S]*path:\s*"\/store\/company"[\s\S]*permission:\s*"store\.manage"/);
assert.match(page, /StoreCompanyManager/);
assert.match(manager, /CompanyProfileSettings/);
assert.match(manager, /company_contact_channels/);
assert.match(manager, /company_locations/);
assert.match(manager, /company_location_hours/);
assert.match(manager, /is_active/);
assert.match(manager, /Inactive — not public/);

console.log("GC-3 company admin contract passed");
