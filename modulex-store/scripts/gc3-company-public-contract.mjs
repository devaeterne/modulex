import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const queries = read("src/lib/store/company/queries.ts");
const contact = read("src/app/contact/page.tsx");
const showroom = read("src/app/showroom/page.tsx");
const about = read("src/app/about/page.tsx");

assert.match(queries, /getStorePublicCompanyLocations/);
assert.match(queries, /get_store_public_company_locations/);
assert.match(contact, /getStorePublicCompanyLocations/);
assert.match(contact, /Promise\.allSettled/);
assert.match(showroom, /locationType\s*===\s*"showroom"/);
assert.match(showroom, /No showroom locations are currently published/);
assert.match(showroom, /href="\/contact"/);
assert.doesNotMatch(showroom, /img\(\d+\)\.jpg|showroom.*\.jpg/i);
assert.match(about, /getStorePublicPage\("about"\)/);
assert.match(about, /getStorePublicCompanyProfile/);

console.log("GC-3 company public contract passed");
