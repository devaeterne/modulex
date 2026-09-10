import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const readAdmin = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const readRepo = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const transactional = readAdmin("src/lib/email/transactional.ts");
const processRoute = readAdmin("src/app/api/admin/email-notifications/process/route.ts");
const monitorRoute = readAdmin("src/app/api/admin/email-notifications/monitor/route.ts");
const monitorPage = readAdmin("src/app/(admin)/settings/email-deliveries/page.tsx");
const notificationDropdown = readAdmin("src/components/ui/NotificationDropdown.tsx");
const notificationLifecycle = readAdmin("src/components/email/NotificationLifecycleBridge.tsx");
const dropdownItem = readAdmin("src/components/ui/dropdown/DropdownItem.tsx");
const notifications = readAdmin("src/lib/notifications.ts");
const permissions = readAdmin("src/lib/auth/permissions.ts");
const migration = readRepo("modulex-store/supabase/migrations/20260910150000_ntf_email_notifications_final_closeout.sql");

// NTF-A1 — provider secrets stay server-only and queue processing never returns
// recipients/provider diagnostics to the browser.
assert.match(transactional, /import\s+["']server-only["']/);
assert.match(transactional, /process\.env\.RESEND_API_KEY/);
assert.doesNotMatch(transactional, /NEXT_PUBLIC_(?:RESEND|EMAIL|SMTP)/);
assert.match(processRoute, /summarizeEmailProcessingResults/);
assert.doesNotMatch(processRoute, /Response\.json\(\{\s*success:\s*true,\s*processed:\s*results\.length,\s*results\s*\}\)/);
assert.match(monitorRoute, /import\s+["']server-only["']/);
assert.doesNotMatch(monitorRoute, /RESEND_API_KEY|NEXT_PUBLIC_(?:RESEND|EMAIL|SMTP)/);

// NTF-A2 — both panel and email delivery are driven by the canonical DB rule +
// permission model. Configured free-form distribution lists are not the authority.
assert.match(transactional, /resolve_notification_delivery_recipients/);
assert.match(transactional, /recipient_scope/);
assert.match(notifications, /low_stock:\s*["']inventory\.manage["']/);
assert.match(notifications, /stock_warehouse_problem:\s*["']inventory\.manage["']/);
assert.match(migration, /stock_review_required[\s\S]*inventory\.manage/);
assert.match(migration, /resolve_notification_delivery_recipients/);
assert.match(migration, /private\.user_has_permission/);
assert.match(migration, /grant execute on function public\.resolve_notification_delivery_recipients\(text, uuid\) to service_role/i);
assert.match(migration, /revoke execute on function public\.resolve_notification_delivery_recipients\(text, uuid\) from public, anon, authenticated/i);

const salesPermissions = permissions.match(/sales:\s*\[([\s\S]*?)\n\s*\],\n\s*finance:/)?.[1] ?? "";
const warehousePermissions = permissions.match(/warehouse:\s*\[([\s\S]*?)\n\s*\],\n\s*shipping:/)?.[1] ?? "";
assert.match(salesPermissions, /["']inventory\.view["']/);
assert.doesNotMatch(salesPermissions, /["']inventory\.manage["']/);
assert.match(warehousePermissions, /["']inventory\.manage["']/);

// NTF-A3 — persistent recipient-scoped reads, deterministic dedupe and safe
// hidden-tab/cross-tab lifecycle and deep-link handling.
assert.match(migration, /dedupe_key/);
assert.match(migration, /unique[\s\S]*user_notifications[\s\S]*user_id[\s\S]*dedupe_key/i);
assert.match(migration, /mark_user_notification_read/);
assert.match(migration, /mark_all_user_notifications_read/);
assert.match(migration, /user_id\s*=\s*v_user_id/);
assert.match(notificationDropdown, /document\.visibilityState\s*!==\s*["']visible["']/);
assert.match(notificationLifecycle, /BroadcastChannel/);
assert.match(notificationLifecycle, /addEventListener\(["']storage["']/);
assert.match(notificationLifecycle, /modulex-notifications-read:/);
assert.match(notificationLifecycle, /document\.visibilityState\s*!==\s*["']visible["']/);
assert.match(dropdownItem, /function\s+safeNotificationHref/);
assert.match(dropdownItem, /value\.startsWith\(["']\/\/["']\)/);
assert.match(dropdownItem, /value\.includes\(["']\\\\["']\)/);

// NTF-A4 — raw queue is no longer readable by normal authenticated roles;
// operators get a sanitized projection plus bounded retry/stuck recovery.
assert.match(migration, /drop policy if exists email_notifications_read on public\.email_notifications/i);
assert.match(migration, /revoke select on table public\.email_notifications from anon, authenticated/i);
assert.match(migration, /get_email_delivery_monitor/);
assert.match(migration, /retry_email_notification/);
assert.match(migration, /attempts\s*<\s*max_attempts/i);
assert.match(migration, /processing_started_at/);
assert.match(migration, /failure_code/);
assert.doesNotMatch(migration, /resend_message_ids[^\n]*returns table/i);
assert.match(monitorRoute, /get_email_delivery_monitor/);
assert.match(monitorRoute, /retry_email_notification/);
assert.match(monitorRoute, /Admin access is required/);
assert.doesNotMatch(monitorRoute, /to_emails|resend_message_ids|payload/);
assert.match(monitorPage, /Retry budget exhausted/);
assert.match(monitorPage, /Process queue/);
assert.match(monitorPage, /failure_reason/);
assert.match(monitorPage, /is_stuck/);

console.log("NTF email + notifications final closeout contract PASS");
