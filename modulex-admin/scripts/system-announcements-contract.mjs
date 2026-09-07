import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../../modulex-store/supabase/migrations/20260908143000_system_announcements.sql", import.meta.url), "utf8");
const notifications = readFileSync(new URL("../src/components/header/NotificationDropdown.tsx", import.meta.url), "utf8");
const model = readFileSync(new URL("../src/lib/system-announcements.ts", import.meta.url), "utf8");
const publisher = readFileSync(new URL("../src/app/(admin)/settings/general/product-updates/page.tsx", import.meta.url), "utf8");
const history = readFileSync(new URL("../src/app/(admin)/updates/page.tsx", import.meta.url), "utf8");

assert.match(migration, /create table if not exists public\.system_announcements/i);
assert.match(migration, /create table if not exists public\.system_announcement_reads/i);
assert.match(migration, /enable row level security/i);
assert.match(migration, /target_roles public\.user_role\[\]/i);
assert.doesNotMatch(migration, /insert\s+into\s+public\.user_notifications/i, "Announcements must not fan out into per-user operational notifications");

assert.match(model, /new_feature/);
assert.match(model, /maintenance/);
assert.match(notifications, /system_announcements/);
assert.match(notifications, /system_announcement_reads/);
assert.match(notifications, /announcement:/);
assert.match(notifications, /\/updates/);
assert.match(publisher, /Publish Now/);
assert.match(publisher, /No role selected = all users/);
assert.match(history, /What&apos;s New/);

console.log("system announcements contract: ok");
