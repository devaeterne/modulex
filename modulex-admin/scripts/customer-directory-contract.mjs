import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const sourcePath = path.join(root, "src/components/customers/CustomersTable.tsx");
const source = fs.readFileSync(sourcePath, "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

assert(
  source.includes('count: "exact"'),
  "customer directory must request an exact filtered row count from Supabase"
);
assert(
  source.includes(".range("),
  "customer directory must paginate at the Supabase query layer"
);
assert(
  !source.includes("filteredCustomers.slice("),
  "customer directory must not paginate by slicing an in-memory full customer list"
);
assert(
  !source.includes('supabase.from("customers").select("*").order('),
  "customer directory must not load the entire customers table before filtering"
);
assert(
  source.includes(".or("),
  "customer directory search must be applied to the Supabase query"
);
assert(
  source.includes("searchCustomerTypeIds") &&
    source.includes("searchPriceGroupIds") &&
    source.includes("searchSalesRepIds"),
  "lookup-name search must remain supported while filtering server-side"
);
assert(
  source.includes("new URLSearchParams(window.location.search)") &&
    source.includes("window.history.replaceState"),
  "customer directory filters and pagination must round-trip through URL query state"
);
assert(
  source.includes('head: true') && source.includes("setSummary("),
  "directory summary cards must use count-only queries instead of page-local customer rows"
);

console.log("PASS: customer directory scalability contract");
