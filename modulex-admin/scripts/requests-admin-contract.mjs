import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));
const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};

const permissions = read("src/lib/auth/permissions.ts");
const sidebar = read("src/layout/AppSidebar.tsx");
const notifications = read("src/lib/notifications.ts");
const dropdown = read("src/components/header/NotificationDropdown.tsx");
const approvals = read("src/components/approvals/ApprovalRequestsManager.tsx");
const page = read("src/app/(admin)/requests/page.tsx");
const center = read("src/components/requests/RequestCenter.tsx");
const emailRoute = read("src/app/api/requests/notify-created/route.ts");
const schema = read("docs/REQUEST_CENTER_SCHEMA.sql");
const routingSqlPath = "docs/NOTIFICATION_ROUTING_V2.sql";

expect(permissions.includes('"requests.view"'), "requests.view permission is missing");
expect(permissions.includes('"requests.manage"'), "requests.manage permission is missing");
expect(permissions.includes('"approvals.review"'), "approvals.review permission is missing");
expect(permissions.includes('path === "/requests"'), "/requests route rule is missing");
expect(sidebar.includes('path: "/requests"'), "Request Center sidebar link is missing");
expect(page.includes("RequestCenter"), "Request Center page is not wired");
expect(/rpc\(\s*"create_support_request"/.test(center), "create_support_request RPC is not used");
expect(center.includes('/api/requests/notify-created'), "request-created email endpoint is not called");
expect(/rpc\(\s*"update_support_request_status"/.test(center), "admin status RPC is not used");
expect(notifications.includes('"request_created"'), "request_created notification type is missing");
expect(notifications.includes('"request_updated"'), "request_updated notification type is missing");
expect(notifications.includes('"request_completed"'), "request_completed notification type is missing");
expect(/low_stock:\s*"inventory\.manage"/.test(notifications), "generic low-stock notifications must require inventory.manage");
expect(/approval_requested:\s*"approvals\.review"/.test(notifications), "approval requests must require approvals.review");
expect(/hasPermission\(profile\.roles,\s*"approvals\.review"\)/.test(approvals), "approval review UI must use approvals.review permission instead of hardcoded roles");
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
expect(schema.includes("private.user_has_permission"), "Request Center must use the shared DB permission helper");
expect(schema.includes("'requests.manage'"), "request manager lookup must target requests.manage permission");
expect(!schema.includes("role in ('super_admin', 'admin')"), "Request Center authorization must not be pinned to admin role names");
expect(schema.includes("for v_manager in"), "new requests must notify active request managers");
expect(schema.includes("v_manager.id"), "new request notifications must target each manager profile");
expect(schema.includes("v_manager.email"), "email deliveries must use manager profile emails");
expect(!schema.includes("lower(email) = 'info@dasoft.me'"), "request manager lookup must not be pinned to one email");
expect(!schema.includes("'info@dasoft.me'"), "request email delivery must not hardcode one recipient");
expect(schema.includes("'request_created'"), "new-request panel notification insert is missing");
expect(schema.includes("'request_updated'"), "request-update notification insert is missing");
expect(schema.includes("'request_completed'"), "completion notification insert is missing");
expect(schema.includes("v_request.requester_id"), "admin actions must target the original requester");

expect(exists(routingSqlPath), true, "notification routing v2 SQL package must exist");
if (exists(routingSqlPath)) {
  const routingSql = read(routingSqlPath);
  expect(/create\s+or\s+replace\s+function\s+private\.user_has_permission/i.test(routingSql), "routing SQL must define private.user_has_permission");
  expect(/'approvals\.review'/i.test(routingSql), "routing SQL must authorize approval review through approvals.review");
  expect(/approval_requested[\s\S]{0,500}approvals\.review/i.test(routingSql), "approval_requested panel routing must target approvers");
  expect(/request_created[\s\S]{0,500}requests\.manage/i.test(routingSql), "request-created routing must target request managers");
  expect(/requested_by[\s\S]{0,500}auth\.uid\(\)/i.test(routingSql), "approval result routing must preserve requester targeting");
}

console.log("requests + permission-aware notification contract: ok");
