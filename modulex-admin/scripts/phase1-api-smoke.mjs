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
  console.error(`Missing Phase 1 smoke environment variables: ${missing.join(", ")}`);
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
    const detail = error instanceof Error ? error.message : String(error);
    checks.push({ name, ok: false, durationMs, detail });
    console.error(`✗ ${name} (${durationMs} ms) — ${detail}`);
  }
}

console.log("=== Modulex Phase 1 authenticated API smoke ===");
console.log("Read-only checks for HR, Store CMS/leads, marketing, reports and notifications.\n");

try {
  await check("Auth signInWithPassword", async () => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (!data.user) throw new Error("Supabase returned no authenticated user.");
    return data.user.email ?? data.user.id;
  });

  await check("Active admin profile", async () => {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;
    if (!userData.user) throw new Error("No authenticated user returned.");

    const { data, error } = await supabase
      .from("profiles")
      .select("id,email,role,is_active")
      .eq("id", userData.user.id)
      .single();
    if (error) throw error;
    if (!data?.is_active || !["super_admin", "admin"].includes(data.role)) {
      throw new Error(`Phase 1 smoke requires active admin/super_admin; current role: ${data?.role ?? "unknown"}`);
    }
    return `${data.email ?? data.id} / ${data.role}`;
  });

  const reads = [
    ["HR Departments", "hr_departments", "id,code,name,is_active"],
    ["HR Positions", "hr_positions", "id,code,title,department_id,is_active"],
    ["HR Employees", "hr_employees", "id,employee_number,first_name,last_name,employment_status"],
    ["HR Employee History", "hr_employee_history", "id,employee_id,event_type,created_at"],
    ["Store Product Content", "store_product_content", "id,base_product_code,slug,display_name,is_published"],
    ["Store Product Media", "store_product_media", "id,product_content_id,media_type,url,is_primary"],
    ["Store Color Options", "store_color_options", "code,display_name,is_active"],
    ["Store Leads", "store_leads", "id,reference_code,lead_type,status,email,created_at"],
    ["Store Lead Activity", "store_lead_activity", "id,lead_id,action,created_at"],
    ["Store Marketing Settings", "store_marketing_settings", "id,tracking_enabled,consent_banner_enabled,respect_do_not_track"],
    ["Notification Delivery Rules", "notification_delivery_rules", "event_type,label,category,panel_enabled"],
    ["Email Notifications", "email_notifications", "id,event_type,audience,entity_type,entity_id,created_at"],
  ];

  for (const [name, table, columns] of reads) {
    await check(`${name} Data API`, async () => {
      const { data, error, count } = await supabase
        .from(table)
        .select(columns, { count: "exact" })
        .limit(1);
      if (error) throw error;
      return `visible rows: ${count ?? data?.length ?? 0}`;
    });
  }

  const rpcChecks = [
    ["Low stock RPC", "get_low_stock_items", { p_limit: 1 }],
    ["Inventory report RPC", "get_product_stock_totals", {}],
    ["Store catalog RPC", "get_store_catalog_products", { p_query: null, p_color_code: null, p_limit: 1, p_offset: 0 }],
    ["Store site settings RPC", "get_store_site_settings", {}],
    ["Store homepage features RPC", "get_store_home_features", {}],
    ["Store public profile RPC", "get_store_public_profile", {}],
    ["Store marketing settings RPC", "get_store_marketing_settings", {}],
    ["Panel notification feed RPC", "get_panel_notification_feed", { p_limit: 1 }],
  ];

  for (const [name, rpc, args] of rpcChecks) {
    await check(name, async () => {
      const { data, error } = await supabase.rpc(rpc, args);
      if (error) throw error;
      const size = Array.isArray(data) ? data.length : data == null ? 0 : 1;
      return `response rows/objects: ${size}`;
    });
  }

  await check("New Store Lead notification rule", async () => {
    const { data, error } = await supabase
      .from("notification_delivery_rules")
      .select("event_type,category,internal_email_enabled,panel_enabled,sound_enabled")
      .eq("event_type", "new_store_lead")
      .single();
    if (error) throw error;
    if (!data?.panel_enabled || !data?.internal_email_enabled) {
      throw new Error("new_store_lead delivery rule is not enabled for panel + email.");
    }
    return `${data.category} / panel+email enabled`;
  });
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

console.log("=== PHASE 1 API SMOKE PASS ===");
