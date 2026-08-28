import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvFile(path) {
  try {
    const text = readFileSync(path, "utf8");
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const index = line.indexOf("=");
      if (index <= 0) continue;
      const key = line.slice(0, index).trim();
      let value = line.slice(index + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    // Local env files are optional; CI can provide variables directly.
  }
}

loadEnvFile(resolve(process.cwd(), ".env.local"));
loadEnvFile(resolve(process.cwd(), ".env"));

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const storeBaseUrl = process.env.STORE_SMOKE_BASE_URL?.replace(/\/$/, "");

const missing = [
  ["NEXT_PUBLIC_SUPABASE_URL", supabaseUrl],
  ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", publishableKey],
].filter(([, value]) => !value).map(([name]) => name);

if (missing.length) {
  console.error(`Missing Store smoke environment variables: ${missing.join(", ")}`);
  process.exit(2);
}

const headers = {
  apikey: publishableKey,
  Accept: "application/json",
  "Content-Type": "application/json",
};

const checks = [];

async function check(name, fn) {
  const startedAt = Date.now();
  try {
    const detail = await fn();
    const durationMs = Date.now() - startedAt;
    checks.push({ name, ok: true, detail, durationMs });
    console.log(`✓ ${name} (${durationMs} ms)${detail ? ` — ${detail}` : ""}`);
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const detail = error instanceof Error ? error.message : String(error);
    checks.push({ name, ok: false, detail, durationMs });
    console.error(`✗ ${name} (${durationMs} ms) — ${detail}`);
  }
}

async function callRpc(name, body = {}) {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${name} returned ${response.status}: ${text.slice(0, 240)}`);
  return text ? JSON.parse(text) : null;
}

console.log("=== Oakwell Store public API smoke ===");
console.log("Read-only checks plus rejected lead-validation requests; no production lead is created.\n");

await check("Public catalog RPC", async () => {
  const rows = await callRpc("get_store_catalog_products", {
    p_query: null,
    p_color_code: null,
    p_limit: 2,
    p_offset: 0,
  });
  if (!Array.isArray(rows)) throw new Error("Catalog RPC did not return an array.");
  return `rows: ${rows.length}`;
});

await check("Public site settings RPC", async () => {
  const row = await callRpc("get_store_site_settings");
  if (row !== null && typeof row !== "object") throw new Error("Site settings RPC returned an unexpected payload.");
  return row ? "settings available" : "no settings row";
});

await check("Public homepage features RPC", async () => {
  const rows = await callRpc("get_store_home_features");
  if (!Array.isArray(rows)) throw new Error("Homepage features RPC did not return an array.");
  return `rows: ${rows.length}`;
});

await check("Public company profile RPC", async () => {
  const row = await callRpc("get_store_public_profile");
  if (row !== null && typeof row !== "object") throw new Error("Company profile RPC returned an unexpected payload.");
  return row ? "profile available" : "no profile row";
});

await check("Public marketing settings RPC", async () => {
  const row = await callRpc("get_store_marketing_settings");
  if (!row || typeof row !== "object") throw new Error("Marketing settings RPC returned no settings object.");
  if (typeof row.tracking_enabled !== "boolean") throw new Error("tracking_enabled is not boolean.");
  if (typeof row.consent_banner_enabled !== "boolean") throw new Error("consent_banner_enabled is not boolean.");
  if (typeof row.respect_do_not_track !== "boolean") throw new Error("respect_do_not_track is not boolean.");
  return `tracking: ${row.tracking_enabled ? "enabled" : "disabled"}`;
});

await check("Anonymous direct lead table access is blocked", async () => {
  const response = await fetch(`${supabaseUrl}/rest/v1/store_leads?select=id&limit=1`, { headers });
  if (response.ok) throw new Error("anon unexpectedly received direct store_leads access.");
  if (![401, 403].includes(response.status)) {
    const body = await response.text();
    throw new Error(`expected 401/403, received ${response.status}: ${body.slice(0, 200)}`);
  }
  return `blocked with ${response.status}`;
});

await check("Lead RPC rejects missing privacy acknowledgement", async () => {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/submit_store_lead`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      p_payload: {
        lead_type: "contact",
        first_name: "Smoke",
        last_name: "Validation",
        email: "smoke.validation@example.com",
        privacy_accepted: false,
      },
    }),
  });
  if (response.ok) throw new Error("Invalid lead payload was unexpectedly accepted.");
  return `rejected with ${response.status}`;
});

await check("Lead RPC honeypot blocks bot submission", async () => {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/submit_store_lead`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      p_payload: {
        lead_type: "contact",
        first_name: "Smoke",
        last_name: "Bot",
        email: "smoke.bot@example.com",
        privacy_accepted: true,
        website_hp: "filled-by-bot",
      },
    }),
  });
  if (response.ok) throw new Error("Honeypot payload was unexpectedly accepted.");
  return `rejected with ${response.status}`;
});

if (storeBaseUrl) {
  await check("Lead endpoint rejects invalid email", async () => {
    const response = await fetch(`${storeBaseUrl}/api/leads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lead_type: "contact",
        first_name: "Smoke",
        last_name: "Endpoint",
        email: "invalid-email",
        privacy_accepted: true,
      }),
    });
    if (response.status !== 400) throw new Error(`expected 400, received ${response.status}`);
    return "400 validation response";
  });

  await check("Lead endpoint rejects oversized request", async () => {
    const response = await fetch(`${storeBaseUrl}/api/leads`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": String(33 * 1024),
      },
      body: JSON.stringify({ lead_type: "contact" }),
    });
    if (response.status !== 413) throw new Error(`expected 413, received ${response.status}`);
    return "413 size guard response";
  });
} else {
  console.log("- STORE_SMOKE_BASE_URL not set; HTTP route checks skipped.");
}

const failed = checks.filter((item) => !item.ok);
console.log(`\nResult: ${checks.length - failed.length}/${checks.length} checks passed.`);
if (failed.length) {
  console.error("Failed checks:");
  for (const item of failed) console.error(` - ${item.name}: ${item.detail}`));
  process.exit(1);
}

console.log("=== STORE API SMOKE PASS ===");
