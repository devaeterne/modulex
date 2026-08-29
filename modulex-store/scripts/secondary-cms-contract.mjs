import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const migrationPath = "supabase/migrations/20260829083000_store_secondary_content_cms.sql";
const migration = fs.readFileSync(path.join(root, migrationPath), "utf8");

for (const table of ["store_pages", "store_projects", "store_project_media"]) {
  assert.match(migration, new RegExp(`create table if not exists public\\.${table}\\b`, "i"), `${table} table must exist`);
  assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, "i"), `${table} must enable RLS`);
  assert.match(migration, new RegExp(`revoke all on public\\.${table} from anon`, "i"), `${table} must revoke anon table access`);
}

assert.match(migration, /store_pages_slug_format[\s\S]*\^\[a-z0-9\]/i, "page slugs must be URL-safe");
assert.match(migration, /store_projects_slug_format[\s\S]*\^\[a-z0-9\]/i, "project slugs must be URL-safe");
assert.match(migration, /status in \('draft','published'\)/i, "draft/published status must be constrained");
assert.match(migration, /store_pages_cta_pair/i, "page CTA label/href must be paired");
assert.match(migration, /store_pages_hero_alt/i, "page hero image must require alt text");
assert.match(migration, /store_projects_publish_ready/i, "published projects must require cover image and alt text");
assert.match(migration, /media_type in \('image','video'\)/i, "project media type must be constrained");
assert.match(migration, /private\.set_store_content_published_at/i, "published_at trigger helper must exist");

for (const table of ["store_pages", "store_projects", "store_project_media"]) {
  assert.match(
    migration,
    new RegExp(`create policy ${table}_internal_read[\\s\\S]*?p\\.role in \\('super_admin','admin','sales'\\)`, "i"),
    `${table} must follow the existing internal read role boundary`,
  );
  assert.match(
    migration,
    new RegExp(`create policy ${table}_admin_[a-z_]+[\\s\\S]*?p\\.role in \\('super_admin','admin'\\)`, "i"),
    `${table} writes must be restricted to admin/super_admin`,
  );
}

const rpcContracts = [
  ["get_store_public_page", "text"],
  ["get_store_public_projects", ""],
  ["get_store_public_project", "text"],
  ["get_store_public_project_media", "text"],
];

function functionSection(name) {
  const marker = `create or replace function public.${name}`;
  const start = migration.indexOf(marker);
  assert.notEqual(start, -1, `${name} must exist`);
  const next = migration.indexOf("create or replace function public.", start + marker.length);
  return migration.slice(start, next === -1 ? migration.indexOf("revoke all on function", start) : next);
}

for (const [name, signature] of rpcContracts) {
  const section = functionSection(name);
  assert.match(section, /security definer/i, `${name} must be SECURITY DEFINER`);
  assert.match(section, /set search_path = pg_catalog, public/i, `${name} must pin search_path`);
  assert.doesNotMatch(section, /select\s+\*/i, `${name} must use a fixed public projection`);

  const returnsMatch = section.match(/returns table\s*\(([\s\S]*?)\)\s*language/i);
  assert.ok(returnsMatch, `${name} must declare a fixed RETURNS TABLE projection`);
  for (const forbiddenField of ["id", "status", "updated_by", "created_at"]) {
    assert.doesNotMatch(
      returnsMatch[1],
      new RegExp(`(^|\\s|,)${forbiddenField}\\s`, "i"),
      `${name} public projection must not expose ${forbiddenField}`,
    );
  }

  const escapedSignature = signature ? `${name}\\(${signature}\\)` : `${name}\\(\\)`;
  assert.match(migration, new RegExp(`revoke all on function public\\.${escapedSignature} from public`, "i"), `${name} must revoke PUBLIC execute`);
  assert.match(migration, new RegExp(`grant execute on function public\\.${escapedSignature} to anon, authenticated`, "i"), `${name} must grant only intended public roles`);
}

assert.match(functionSection("get_store_public_page"), /p\.status = 'published'/i, "public page RPC must filter to published rows");
assert.match(functionSection("get_store_public_projects"), /p\.status = 'published'/i, "public project list must filter to published rows");
assert.match(functionSection("get_store_public_project"), /p\.status = 'published'/i, "public project RPC must filter to published rows");
assert.match(
  functionSection("get_store_public_project_media"),
  /join public\.store_projects p[\s\S]*p\.status = 'published'/i,
  "public project media must require a published owning project",
);
assert.match(
  functionSection("get_store_public_projects"),
  /order by p\.sort_order asc, p\.published_at desc nulls last, p\.id asc/i,
  "public project ordering must be deterministic",
);
assert.match(
  functionSection("get_store_public_project_media"),
  /order by m\.sort_order asc, m\.id asc/i,
  "public project media ordering must be deterministic",
);

assert.doesNotMatch(migration, /insert into public\.store_projects/i, "migration must not seed fake projects");
assert.doesNotMatch(migration, /Manhattan|Brooklyn|testimonial|award/i, "migration must not reintroduce template/demo content");

console.log("Secondary CMS contract PASS");
