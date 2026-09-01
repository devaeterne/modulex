import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const configurator = read("src/components/countertop/CountertopConfigurator.tsx");
const migrationDir = path.join(root, "../modulex-store/supabase/migrations");
const guardFile = fs.readdirSync(migrationDir).find((name) => name.endsWith("_countertop_order_price_group_guard.sql"));

assert(guardFile, "countertop order price-group guard migration must exist");
assert(configurator.includes('.from("customer_orders")'), "Add Countertop must load the saved Order price group");
assert(configurator.includes('select("price_group_id")'), "Countertop pricing context must use the Order price_group_id");
assert(configurator.includes("canCalculate"), "CountertopConfigurator must track required-field readiness");
assert(/disabled=\{!canCalculate\}/.test(configurator), "Calculate price must be disabled until required fields are complete");
assert(configurator.includes("Inherited from the saved order"), "Countertop price group must be explained as inherited from the saved order");
assert(configurator.includes("dark:text-gray-300"), "Countertop field labels must be readable in dark mode");

console.log("Order countertop context contract: PASS");
