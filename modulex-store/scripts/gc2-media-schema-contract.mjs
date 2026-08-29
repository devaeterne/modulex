import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const migration = path.join(
  here,
  "../supabase/migrations/20260829150000_store_media_library.sql"
);
const grantHardeningMigration = path.join(
  here,
  "../supabase/migrations/20260829150500_store_media_library_grant_hardening.sql"
);
const sql = readFileSync(migration, "utf8").toLowerCase();
const grantHardeningSql = readFileSync(grantHardeningMigration, "utf8").toLowerCase();

for (const token of [
  "create table if not exists public.store_media_assets",
  "create table if not exists public.store_media_asset_sources",
  "store-media-staging",
  "original_sha256",
  "optimized_sha256",
  "staging_original_path",
  "staging_optimized_path",
  "public_bucket",
  "public_path",
  "default_alt_text",
  "source_candidate_id",
  "source_url",
  "alter table public.store_media_assets enable row level security",
  "alter table public.store_media_asset_sources enable row level security",
  "store_media_staging_admin_select",
  "store_media_staging_admin_insert",
  "store_media_staging_admin_update",
  "store_media_staging_admin_delete",
]) {
  assert.ok(sql.includes(token), `missing ${token}`);
}

for (const token of [
  "revoke all on public.store_media_assets from authenticated",
  "revoke all on public.store_media_asset_sources from authenticated",
  "grant select, insert, update, delete on public.store_media_assets to authenticated",
  "grant select, insert, update, delete on public.store_media_asset_sources to authenticated",
]) {
  assert.ok(grantHardeningSql.includes(token), `missing grant hardening: ${token}`);
}

assert.ok(!sql.includes("grant select on public.store_media_assets to anon"));
assert.ok(!sql.includes("grant select on public.store_media_asset_sources to anon"));
assert.ok(!sql.includes("media_asset_id uuid references public.store_media_assets"));
assert.ok(!sql.includes("get_store_public_media"));

console.log("GC-2 media schema contract: PASS");
