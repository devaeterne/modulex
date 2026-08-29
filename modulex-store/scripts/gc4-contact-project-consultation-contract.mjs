import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");

const migration = read("supabase/migrations/20260829213000_gc4_contact_project_consultation.sql");
assert.match(migration, /request_kind text not null default 'general_inquiry'/);
assert.match(migration, /create table if not exists public\.store_lead_form_options/);
assert.match(migration, /store_api_private\.submit_store_lead/);
assert.match(migration, /create or replace function public\.submit_store_lead/);
assert.doesNotMatch(migration.match(/create or replace function public\.submit_store_lead[\s\S]*?\$\$;/)?.[0] ?? "", /security definer/i);
assert.match(migration, /create or replace function store_api_private\.get_store_public_lead_form_options/);
assert.match(migration, /create or replace function public\.get_store_public_lead_form_options/);
assert.match(migration, /revoke all on table public\.store_lead_form_options from anon/);
assert.match(migration, /current_user_has_any_role\(array\['super_admin', 'admin'\]/);
assert.match(migration, /v_type = 'dealer_application'.*project/i);

const types = read("src/lib/store/leads/types.ts");
assert.match(types, /StoreLeadRequestKind/);
assert.match(types, /project_consultation/);
assert.match(types, /preferred_consultation_date/);

const route = read("src/app/api/leads/route.ts");
assert.match(route, /request_kind/);
assert.match(route, /project_type/);
assert.match(route, /preferred_consultation_date/);

const form = read("src/components/leads/LeadForm.tsx");
assert.match(form, /Project Consultation/);
assert.match(form, /General Inquiry/);
assert.match(form, /project_address/);
assert.doesNotMatch(form, /project.*document|project.*upload/i);

const contact = read("src/app/contact/page.tsx");
assert.match(contact, /getStorePublicLeadFormOptions/);

console.log("GC-4 contact/project consultation contract passed.");
