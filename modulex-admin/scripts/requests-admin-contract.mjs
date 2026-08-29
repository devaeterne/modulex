import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};

const permissions = read("src/lib/auth/permissions.ts");
const sidebar = read("src/layout/AppSidebar.tsx");
const notifications = read("src/lib/notifications.ts");
const dropdown = read("src/components/header/NotificationDropdown.tsx");
const page = read("src/app/(admin)/requests/page.tsx");
const center = read("src/components/requests/RequestCenter.tsx");
const emailRoute = read("src/app/api/requests/notify-created/route.ts");
const schema = read("docs/REQUEST_CENTER_SCHEMA.sql");

expect(permissions.includes('"requests.view"'), "requests.view permission is missing");
expect(permissions.includes('"requests.manage"'), "requests.manage permission is missing");
expect(permissions.includes('path === "/requests"'), "/requests route rule is missing");
expect(sidebar.includes('path: "/requests"'), "Request Center sidebar link is missing");
expect(page.includes("RequestCenter"), "Request Center page is not wired");
expect(center.includes('rpc("create_support_request"'), "create_support_request RPC is not used");
expect(center.includes('/api/requests/notify-created'), "request-created email endpoint is not called");
expect(center.includes('rpc("update_support_request_status"'), "admin status RPC is not used");
expect(notifications.includes('"request_created"'), "request_created notification type is missing");
expect(notifications.includes('"request_updated"'), "request_updated notification type is missing");
expect(notifications.includes('"request_completed"'), "request_completed notification type is missing");
expect(dropdown.includes('from("user_notifications")'), "targeted user notification feed is not queried");
expect(dropdown.includes('"request_created"'), "new-request targeted notification is not shown");
expect(dropdown.includes('"request_updated"'), "request-update targeted notification is not shown");
expect(dropdown.includes('rpc("mark_user_notification_read"'), "DB-backed notification read tracking is missing");
expect(
  dropdown.includes(
    'const unreadNotifications = visibleNotifications.filter((notification) => !isRead(notification.id));'
  ),
  "read notifications must be removed from the dropdown"
);
expect(dropdown.includes('unreadNotifications.map((notification)'), "dropdown must render only unread notifications");
expect(dropdown.includes("Mark all as read"), "mark-all-as-read action is missing");
expect(dropdown.includes('rpc("mark_all_user_notifications_read"'), "mark-all-as-read must persist request notification state");
expect(emailRoute.includes("RESEND_API_KEY"), "request email route must use server-side Resend configuration");
expect(emailRoute.includes("auth.getUser"), "request email route must authenticate the caller");
expect(emailRoute.includes("requester_id"), "request email route must verify request ownership");
expect(emailRoute.includes("recipient_email"), "request email route must use the queued recipient");
expect(emailRoute.includes("to: [delivery.recipient_email]"), "request email route must send to each queued manager recipient");
expect(!emailRoute.includes("REQUEST_ADMIN_EMAIL"), "request email route must not use a hardcoded recipient constant");
expect(!emailRoute.includes("info@dasoft.me"), "request email route must not pin delivery to one email address");
expect(schema.includes("create table if not exists public.support_requests"), "support_requests table is missing");
expect(schema.includes("create table if not exists public.user_notifications"), "user_notifications table is missing");
expect(schema.includes("create table if not exists public.support_request_email_deliveries"), "support request email delivery audit is missing");
expect(schema.includes("enable row level security"), "RLS is missing");
expect(schema.includes("auth.uid()"), "auth.uid ownership guard is missing");
expect(schema.includes("create or replace function public.create_support_request"), "create_support_request function is missing");
expect(schema.includes("create or replace function public.update_support_request_status"), "update_support_request_status function is missing");
expect(schema.includes("public.user_roles"), "request manager lookup must honor secondary roles");
expect(schema.includes("role in ('super_admin', 'admin')"), "request manager lookup must target admin roles");
expect(schema.includes("for v_manager in"), "new requests must notify active request managers");
expect(schema.includes("v_manager.id"), "new request notifications must target each manager profile");
expect(schema.includes("v_manager.email"), "email deliveries must use manager profile emails");
expect(!schema.includes("lower(email) = 'info@dasoft.me'"), "request manager lookup must not be pinned to one email");
expect(!schema.includes("'info@dasoft.me'"), "request email delivery must not hardcode one recipient");
expect(schema.includes("'request_created'"), "new-request panel notification insert is missing");
expect(schema.includes("'request_updated'"), "request-update notification insert is missing");
expect(schema.includes("'request_completed'"), "completion notification insert is missing");
expect(schema.includes("v_request.requester_id"), "admin actions must target the original requester");

console.log("requests admin contract: ok");
