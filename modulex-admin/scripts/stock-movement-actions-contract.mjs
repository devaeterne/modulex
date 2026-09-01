import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const source = fs.readFileSync(
  path.join(root, "src/components/stock-movements/StockMovementsTable.tsx"),
  "utf8",
);

const expect = (ok, message) => {
  if (!ok) throw new Error(message);
};

expect(source.includes("Actions"), "Stock Movements must expose an Actions column");
expect(source.includes("View Details"), "Stock Movements must expose movement details");
expect(source.includes("Modal"), "Stock Movements details must use the shared Modal");
expect(source.includes("Reverse / Correct"), "Stock Movements must expose audit-safe reversal instead of editing posted rows");
expect(source.includes('supabase.rpc("reverse_inventory_movement"'), "Stock Movements reversal must use the existing reverse_inventory_movement RPC");
expect(source.includes('hasPermission(profile?.roles, "inventory.manage")'), "Movement reversal must remain gated by inventory.manage");
expect(source.includes("Reason is required"), "Movement reversal must require an audit reason");
expect(!source.includes("Edit Movement") && !source.includes("Delete Movement"), "Posted movements must not expose edit/delete actions");

console.log("stock movement actions contract: ok");
