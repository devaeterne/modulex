import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};

const center = read("src/components/requests/RequestCenter.tsx");
const emailRoute = read("src/app/api/requests/notify-created/route.ts");
const schema = read("docs/REQUEST_CENTER_SCHEMA.sql");

expect(center.includes('hasPermission(profile?.roles, "requests.manage")'), "Request Center must honor all assigned roles");
expect(center.includes("new Intl.DateTimeFormat(undefined"), "Request dates must use the runtime locale");
expect(!center.includes("setError(profileError?.message"), "Profile errors must not be exposed raw");
expect(!center.includes("setError(requestError.message)"), "Request load errors must not be exposed raw");
expect(!center.includes("setError(createError.message)"), "Create RPC errors must not be exposed raw");
expect(!center.includes("setError(updateError.message)"), "Update RPC errors must not be exposed raw");
expect(center.includes("console.error("), "Technical Request Center failures must still be logged");
expect(center.includes("creating"), "Create saving state must be isolated");
expect(center.includes("updatingRequestId"), "Per-request update saving state must be isolated");
expect(center.includes("useSearchParams"), "Request Center must read request deep links");
expect(center.includes("scrollIntoView"), "Deep-linked requests must scroll into view");
expect(center.includes("ring-2 ring-brand-500"), "Deep-linked requests must receive a visible highlight");
expect(center.includes('id="request-search"') && center.includes('htmlFor="request-search"'), "Request search needs an explicit accessible label");
expect(center.includes('id="request-status-filter"') && center.includes('htmlFor="request-status-filter"'), "Status filter needs an explicit accessible label");
expect(center.includes("focus-visible:ring-2"), "Interactive Request Center controls need keyboard focus styles");
expect(!emailRoute.includes("REQUEST_ADMIN_EMAIL"), "Request email route must not depend on a hardcoded admin constant");
expect(!emailRoute.includes("info@dasoft.me"), "Request email route must not hardcode a recipient address");
expect(emailRoute.includes("recipient_email"), "Request email route must resolve the queued recipient dynamically");
expect(schema.includes("role in ('super_admin', 'admin')"), "Request manager lookup must allow active admin roles");
expect(schema.includes("user_roles"), "Request manager lookup must honor secondary assigned roles");
expect(!schema.includes("lower(email) = 'info@dasoft.me'"), "Request Center schema must not pin manager lookup to one email");
expect(!schema.includes("'info@dasoft.me'"), "Request Center schema must not hardcode the delivery recipient");

console.log("request center UI contract: ok");
