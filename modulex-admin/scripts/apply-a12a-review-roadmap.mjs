import fs from "node:fs";

const path = "ADMIN_ROADMAP.md";
let text = fs.readFileSync(path, "utf8");
const from = "  - A1.2A keeps both routes on the shared `CustomerOrdersList`, moves search/status/exact count/page windows to Supabase, resolves only matching/page customer lookups, and moves unfiltered summary aggregation to a SECURITY INVOKER RPC under existing order RLS.";
const to = "  - A1.2A keeps both routes on the shared `CustomerOrdersList`, moves search/status/exact count/page windows to Supabase, queries order + customer search fields through a `security_invoker=true` directory view instead of browser-side customer-ID fan-out, and moves unfiltered summary aggregation to a SECURITY INVOKER RPC under existing RLS.";
if (!text.includes(from)) throw new Error("A1.2A roadmap tracking line not found");
text = text.replace(from, to);
fs.writeFileSync(path, text);
