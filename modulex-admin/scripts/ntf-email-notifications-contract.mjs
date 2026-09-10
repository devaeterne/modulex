import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const readAdmin = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const readRepo = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const transactional = readAdmin("src/lib/email/transactional.ts");
const processRoute = readAdmin("src/app/api/admin/email-notifications/process/route.ts");
const notificationDropdown = readAdmin("src/components/ui/NotificationDropdown.tsx");
const notifications = readAdmin("src/lib/notifications.ts");
const migration = readRepo("modulex-store/supabase/migrations/20260910150000_ntf_email_notifications_final_closeout.sql");

// NTF-A1 — provider secrets stay server-only and queue processing never returns
// recipients/provider diagnostics to the browser.
assert.match(transactional, /import\s+["']server-only["']/);
assert.match(transactional, /process\.env\.RESEND_API_KEY/);
assert.doesNotMatch(transactional, /NEXT_PUBLIC_(?:RESEND|EMAIL|SMTP)/);
assert.match(processRoute, /summarizeEmailProcessingResults/);
assert.doesNotMatch(processRoute, /Response\.json\(\{\s*success:\s*true,\s*processed:\s*results\.length,\s*results\s*\}\)/);

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

// NTF-A3 — persistent recipient-scoped reads, deterministic dedupe and safe
// cross-tab lifecycle/deep-link handling.
assert.match(migration, /dedupe_key/);
assert.match(migration, /unique[\s\S]*user_notifications[\s\S]*user_id[\s\S]*dedupe_key/i);
assert.match(migration, /mark_all_user_notifications_read/);
assert.match(migration, /user_id\s*=\s*auth\.uid\(\)/);
assert.match(notificationDropdown, /BroadcastChannel/);
assert.match(notificationDropdown, /storage/);
assert.match(notificationDropdown, /safeNotificationHref/);
assert.match(notificationDropdown, /document\.visibilityState\s*!==\s*["']visible["']/);

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

console.log("NTF email + notifications final closeout contract PASS");
