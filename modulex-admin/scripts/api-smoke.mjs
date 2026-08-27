import { performance } from "node:perf_hooks";
import { resolve } from "node:path";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env"), override: false });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const email = process.env.SMOKE_TEST_EMAIL;
const password = process.env.SMOKE_TEST_PASSWORD;

const missing = [
  ["NEXT_PUBLIC_SUPABASE_URL", url],
  ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", key],
  ["SMOKE_TEST_EMAIL", email],
  ["SMOKE_TEST_PASSWORD", password],
].filter(([, value]) => !value).map(([name]) => name);

if (missing.length) {
  console.error(`Missing smoke test environment variables: ${missing.join(", ")}`);
  process.exit(2);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const checks = [];

async function check(name, fn) {
  const start = performance.now();
  try {
    const detail = await fn();
    const durationMs = Math.round(performance.now() - start);
    checks.push({ name, ok: true, durationMs, detail });
    console.log(`✓ ${name} (${durationMs} ms)${detail ? ` — ${detail}` : ""}`);
  } catch (error) {
    const durationMs = Math.round(performance.now() - start);
    const message = error instanceof Error ? error.message : String(error);
    checks.push({ name, ok: false, durationMs, detail: message });
    console.error(`✗ ${name} (${durationMs} ms) — ${message}`);
  }
}

function throwIfError(result) {
  if (result.error) throw result.error;
  return result.data;
}

console.log("=== Modulex authenticated API / RLS smoke ===");
console.log("This suite is read-only. It uses a real Supabase Auth session and the publishable key.\n");

try {
  await check("Auth signInWithPassword", async () => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (!data.user) throw new Error("Supabase returned no authenticated user.");
    return data.user.email ?? data.user.id;
  });

  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;

  await check("Auth getUser", async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;
    if (!data.user) throw new Error("No authenticated user returned.");
    return data.user.id;
  });

  let role = null;
  await check("Own profile / role", async () => {
    if (!userId) throw new Error("Authenticated user id is unavailable.");
    const data = throwIfError(await supabase
      .from("profiles")
      .select("id,email,role,is_active")
      .eq("id", userId)
      .single());
    if (!data?.is_active) throw new Error("Smoke test profile is inactive.");
    role = data.role;
    if (!["super_admin", "admin"].includes(role)) {
      throw new Error(`SMOKE_TEST_EMAIL must use an active admin/super_admin profile; current role: ${role}`);
    }
    return `${data.email ?? userId} / ${role}`;
  });

  const reads = [
    ["Products Data API", "products", "id,sku,name,status"],
    ["Customers Data API", "customers", "id,customer_code,name,status"],
    ["Inventory Data API", "inventory", "id,product_id,quantity,reserved_quantity"],
    ["Warehouses Data API", "warehouses", "id,code,name,is_active"],
    ["Price Groups Data API", "price_groups", "id,system_key,name,is_active"],
    ["Payment Methods Data API", "payment_methods", "id,system_key,name,is_active"],
    ["General Settings Data API", "general_settings", "id,company_name,default_currency,locale,timezone"],
    ["Orders Data API", "customer_orders", "id,order_number,status,customer_id"],
    ["Invoices Data API", "customer_invoices", "id,invoice_number,status,customer_id"],
    ["Shipments Data API", "customer_shipments", "id,shipment_number,status,customer_id"],
    ["Installations Data API", "customer_installations", "id,installation_number,status,customer_id"],
  ];

  for (const [name, table, columns] of reads) {
    await check(name, async () => {
      const { data, error, count } = await supabase
        .from(table)
        .select(columns, { count: "exact" })
        .limit(1);
      if (error) throw error;
      return `visible rows: ${count ?? data?.length ?? 0}`;
    });
  }

  const rpcChecks = [
    ["RPC get_products_page", "get_products_page", { p_query: "", p_page: 1, p_page_size: 1 }],
    ["RPC get_product_prices_page", "get_product_prices_page", { p_query: "", p_page: 1, p_page_size: 1, p_currency_code: "USD" }],
    ["RPC get_product_stock_totals", "get_product_stock_totals", {}],
    ["RPC get_low_stock_items", "get_low_stock_items", { p_limit: 1 }],
    ["RPC search_stock", "search_stock", { p_query: "", p_limit: 1 }],
    ["RPC get_recent_inventory_movements", "get_recent_inventory_movements", { p_limit: 1 }],
  ];

  for (const [name, rpc, args] of rpcChecks) {
    await check(name, async () => {
      const { data, error } = await supabase.rpc(rpc, args);
      if (error) throw error;
      const rows = Array.isArray(data) ? data.length : data == null ? 0 : 1;
      return `response rows/objects: ${rows}`;
    });
  }
} finally {
  await supabase.auth.signOut();
}

const failed = checks.filter((item) => !item.ok);
console.log(`\nResult: ${checks.length - failed.length}/${checks.length} checks passed.`);
if (failed.length) {
  console.error("Failed checks:");
  failed.forEach((item) => console.error(` - ${item.name}: ${item.detail}`));
  process.exit(1);
}

console.log("=== API / RLS SMOKE PASS ===");
