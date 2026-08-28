import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const read = async (relative) => {
  try {
    return await readFile(path.join(root, relative), "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return "";
    throw error;
  }
};

const route = await read("src/app/api/admin/dealer-portal/route.ts");

assert.match(route, /customer_types|customer_type/i, "Admin portal provisioning must resolve customer type server-side");
assert.match(route, /dealer_portal/, "Admin provisioning must preserve trusted Dealer Portal metadata");
assert.match(route, /customer_portal/, "Admin provisioning must create trusted Customer Portal metadata");
assert.match(route, /system_key|customerType/i, "Admin must derive account kind from customer business classification");
assert.doesNotMatch(route, /body\.account_type|body\[['"]account_type['"]\]/, "browser input must not choose Auth account type");
assert.match(route, /auth\.admin\.createUser/, "external portal Auth users must still be created server-side");
assert.match(route, /profiles/, "external portal provisioning must verify no internal profile is created");
assert.match(route, /portal_enabled/, "existing portal-enabled lifecycle gate must remain");
assert.match(route, /suspend|suspended/, "existing suspension lifecycle must remain");
assert.match(route, /restore/, "existing restore lifecycle must remain");

console.log("store portal admin contract: ok");
