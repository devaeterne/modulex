import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd(), "..");
const targets = [
  "modulex-store/supabase/migrations/20260904150000_customer_project_participants_commission_ledger.sql",
  "modulex-admin/sql/project-pb6-participants-commission-ledger.sql",
];
const before = "      nullif(btrim(p.full_name), ''), p.email, 'Unnamed participant'\n    ),\n    pp.is_active, pp.source, pp.started_at, pp.ended_at";
const after = "      nullif(btrim(p.full_name), ''), p.email, 'Unnamed participant'\n    ) as display_name,\n    pp.is_active, pp.source, pp.started_at, pp.ended_at";

for (const relative of targets) {
  const filename = path.join(root, relative);
  const source = fs.readFileSync(filename, "utf8");
  const count = source.split(before).length - 1;
  if (count === 0 && source.includes("    ) as display_name,\n    pp.is_active")) continue;
  if (count !== 1) throw new Error(`${relative}: expected one unaliased display name expression, found ${count}`);
  fs.writeFileSync(filename, source.replace(before, after));
}

console.log("PB-6 replay alias safety applied");
