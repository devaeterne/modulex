import fs from "node:fs";

const roadmapPath = "ADMIN_ROADMAP.md";
let roadmap = fs.readFileSync(roadmapPath, "utf8");
const roadmapFrom = "- [ ] Review global and customer-scoped order list consistency.";
const roadmapTo = "- [~] Review global and customer-scoped order list consistency.\n  - A1.2A keeps both routes on the shared `CustomerOrdersList`, moves search/status/exact count/page windows to Supabase, resolves only matching/page customer lookups, and moves unfiltered summary aggregation to a SECURITY INVOKER RPC under existing order RLS.";
if (!roadmap.includes(roadmapFrom)) throw new Error("A1.2A roadmap task not found");
roadmap = roadmap.replace(roadmapFrom, roadmapTo);
fs.writeFileSync(roadmapPath, roadmap);

const listPath = "src/components/customers/CustomerOrdersList.tsx";
let list = fs.readFileSync(listPath, "utf8");
const listFrom = 'summary.currencyCount <= 1\n      ? money(summary.totalValue, summary.currencyCode || selectedCustomer?.id ? summary.currencyCode || "USD" : summary.currencyCode || "USD")\n      : "Multiple currencies";';
const listTo = 'summary.currencyCount <= 1\n      ? money(summary.totalValue, summary.currencyCode || "USD")\n      : "Multiple currencies";';
if (!list.includes(listFrom)) throw new Error("A1.2A total value expression not found");
list = list.replace(listFrom, listTo);
fs.writeFileSync(listPath, list);
