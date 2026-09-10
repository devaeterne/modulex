import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const readAdmin = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const readRepo = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const has = (source, needle, message) => assert.ok(source.includes(needle), message);
const lacks = (source, needle, message) => assert.ok(!source.includes(needle), message);

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

// NTF-A1 — provider credentials are server-only and browser APIs expose only summaries.
has(transactional, 'import "server-only";', "transactional email transport must be server-only");
has(transactional, "process.env.RESEND_API_KEY", "email transport must read the server RESEND_API_KEY");
lacks(transactional, "NEXT_PUBLIC_RESEND", "provider keys must never be NEXT_PUBLIC");
lacks(transactional, "NEXT_PUBLIC_EMAIL", "email secrets must never be NEXT_PUBLIC");
lacks(transactional, "NEXT_PUBLIC_SMTP", "SMTP secrets must never be NEXT_PUBLIC");
has(processRoute, "summarizeEmailProcessingResults", "queue process API must return a sanitized summary");
lacks(processRoute, "results });", "queue process API must not return raw processing results");
has(monitorRoute, 'import "server-only";', "delivery monitor API must be server-only");
lacks(monitorRoute, "RESEND_API_KEY", "delivery monitor API must not read or expose provider credentials");

// NTF-A2 — internal delivery routing is canonical and permission-aware.
has(transactional, 'supabaseAdmin.rpc("resolve_notification_delivery_recipients"', "internal recipients must use the canonical resolver");
has(transactional, '.from("notification_delivery_rules")', "email enablement must use canonical delivery rules");
has(notifications, 'low_stock: "inventory.manage"', "low stock must require inventory.manage");
has(notifications, 'stock_warehouse_problem: "inventory.manage"', "warehouse problems must require inventory.manage");
has(migration, "where event_type = 'stock_review_required';", "stock review rule must be explicitly canonicalized");
has(migration, "required_permissions = array['inventory.manage']::text[]", "stock review recipients must require inventory.manage");
has(migration, "private.user_has_permission", "recipient resolver must evaluate effective permissions");
has(migration, "revoke execute on function public.resolve_notification_delivery_recipients(text, uuid) from public, anon, authenticated;", "recipient resolver must be service-only");
has(migration, "grant execute on function public.resolve_notification_delivery_recipients(text, uuid) to service_role;", "recipient resolver must be callable by service role");

const salesStart = permissions.indexOf("  sales: [");
const financeStart = permissions.indexOf("  finance: [");
const warehouseStart = permissions.indexOf("  warehouse: [");
const shippingStart = permissions.indexOf("  shipping: [");
assert.ok(salesStart >= 0 && financeStart > salesStart, "sales permission block must exist");
assert.ok(warehouseStart >= 0 && shippingStart > warehouseStart, "warehouse permission block must exist");
const salesPermissions = permissions.slice(salesStart, financeStart);
const warehousePermissions = permissions.slice(warehouseStart, shippingStart);
has(salesPermissions, '"inventory.view"', "Sales should retain inventory read visibility");
lacks(salesPermissions, '"inventory.manage"', "Sales must not receive inventory-manage notifications");
has(warehousePermissions, '"inventory.manage"', "Warehouse must retain inventory-manage notifications");

// NTF-A3 — recipient-scoped persistent reads, dedupe, hidden-tab polling, safe links and cross-tab refresh.
has(migration, "add column if not exists dedupe_key text", "user notifications need a deterministic dedupe key");
has(migration, "on public.user_notifications (user_id, dedupe_key)", "dedupe must be recipient-scoped");
has(migration, "mark_user_notification_read", "single notification read RPC must exist");
has(migration, "mark_all_user_notifications_read", "mark-all-read RPC must exist");
has(migration, "and user_id = v_user_id;", "read mutation must be recipient-authorized");
has(notificationDropdown, 'document.visibilityState !== "visible"', "notification polling must pause for hidden tabs");
has(notificationLifecycle, "BroadcastChannel", "notification lifecycle must support cross-tab channel synchronization");
has(notificationLifecycle, 'addEventListener("storage"', "notification lifecycle must synchronize local read state across tabs");
has(notificationLifecycle, "modulex-notifications-read:", "cross-tab listener must use the canonical read-state key");
has(notificationLifecycle, 'document.visibilityState !== "visible"', "hidden tabs must not reload for cross-tab changes");
has(dropdownItem, "safeNotificationHref", "notification links must pass through a safe href guard");
has(dropdownItem, 'value.startsWith("//")', "notification links must reject protocol-relative URLs");
has(dropdownItem, 'value.includes("\\\\")', "notification links must reject backslash-based paths");

// NTF-A4 — raw queue remains private; operators receive sanitized monitoring and bounded retry.
has(migration, "revoke select on table public.email_notifications from anon, authenticated;", "raw delivery queue must not be browser-readable");
has(migration, "get_email_delivery_monitor", "sanitized delivery monitor RPC must exist");
has(migration, "retry_email_notification", "bounded retry RPC must exist");
has(migration, "and attempts < max_attempts", "manual retry must respect retry budget");
has(migration, "failure_code", "delivery failures need machine-safe codes");
has(migration, "processing_started_at", "delivery leases need processing timestamps");
has(migration, "recover_stuck_email_notifications", "stuck delivery recovery must exist");
has(monitorRoute, 'supabaseAdmin.rpc("get_email_delivery_monitor"', "operator API must use the sanitized monitor RPC");
has(monitorRoute, 'supabaseAdmin.rpc("retry_email_notification"', "operator API must use bounded retry RPC");
has(monitorRoute, "Admin access is required.", "operator delivery monitor must enforce Admin access");
lacks(monitorRoute, '.from("email_notifications")', "operator API must never read the raw queue directly");
lacks(monitorRoute, "to_emails", "operator API must not expose recipient addresses");
lacks(monitorRoute, "resend_message_ids", "operator API must not expose provider message IDs");
has(monitorPage, "Retry budget exhausted", "operator UI must show exhausted retry state");
has(monitorPage, "Process queue", "operator UI must expose an explicit queue action");
has(monitorPage, "failure_reason", "operator UI must show sanitized failure reasons");
has(monitorPage, "is_stuck", "operator UI must show stuck deliveries");

console.log("NTF email + notifications final closeout contract PASS");
