import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};

const center = read("src/components/requests/RequestCenter.tsx");
const textArea = read("src/components/form/input/TextArea.tsx");
const emailRoute = read("src/app/api/requests/notify-created/route.ts");
const schema = read("docs/REQUEST_CENTER_SCHEMA.sql");
const packageJson = JSON.parse(read("package.json"));

expect(center.includes('hasPermission(profile?.roles, "requests.manage")'), "Request Center must honor all assigned roles");
expect(center.includes("new Intl.DateTimeFormat(undefined"), "Request dates must use the runtime locale");
expect(!center.includes("setError(profileError?.message"), "Profile errors must not be exposed raw");
expect(!center.includes("setError(requestError.message)"), "Request load errors must not be exposed raw");
expect(!center.includes("setError(createError.message)"), "Create RPC errors must not be exposed raw");
expect(!center.includes("setError(updateError.message)"), "Update RPC errors must not be exposed raw");
expect(center.includes("console.error("), "Technical Request Center failures must still be logged");
expect(center.includes("creating"), "Create saving state must be isolated");
expect(center.includes("updatingRequestIds"), "Per-request update saving state must be isolated");
expect(center.includes("useSearchParams"), "Request Center must read request deep links");
expect(center.includes("scrollIntoView"), "Deep-linked requests must scroll into view");
expect(center.includes("ring-2 ring-brand-500"), "Deep-linked requests must receive a visible highlight");

for (const primitive of ["ComponentCard", "Label", "Input", "Select", "TextArea", "Button", "Badge", "Alert"]) {
  expect(center.includes(primitive), `Request Center must compose the shared ${primitive} primitive`);
}
expect(!/<(?:input|select|textarea|button)\b/.test(center), "Request Center must not reimplement shared form or button primitives");

for (const id of ["request-title", "request-category", "request-description", "request-search", "request-status-filter"]) {
  expect(center.includes(`id="${id}"`), `${id} control id is missing`);
  expect(center.includes(`htmlFor="${id}"`), `${id} label association is missing`);
}

expect(/rpc\(\s*"create_support_request"/.test(center), "create_support_request RPC is not used");
expect(/rpc\(\s*"update_support_request_status"/.test(center), "update_support_request_status RPC is not used");

for (const prop of ["required?: boolean;", "minLength?: number;", "maxLength?: number;"]) {
  expect(textArea.includes(prop), `TextArea must expose ${prop}`);
}
expect(textArea.includes("required={required}"), "TextArea must pass required to the native textarea");
expect(textArea.includes("minLength={minLength}"), "TextArea must pass minLength to the native textarea");
expect(textArea.includes("maxLength={maxLength}"), "TextArea must pass maxLength to the native textarea");

expect(
  (packageJson.scripts?.["smoke:request-center-ui"] ?? "").includes("request-center-ui-contract.mjs"),
  "Request Center UI contract must be available through the package smoke convention",
);
expect(
  (packageJson.scripts?.smoke ?? "").includes("npm run smoke:request-center-ui"),
  "Request Center UI contract must run in the normal Admin smoke chain",
);

expect(!emailRoute.includes("REQUEST_ADMIN_EMAIL"), "Request email route must not depend on a hardcoded admin constant");
expect(!emailRoute.includes("info@dasoft.me"), "Request email route must not hardcode a recipient address");
expect(emailRoute.includes("recipient_email"), "Request email route must resolve the queued recipient dynamically");
expect(schema.includes("role in ('super_admin', 'admin')"), "Request manager lookup must allow active admin roles");
expect(schema.includes("user_roles"), "Request manager lookup must honor secondary assigned roles");
expect(!schema.includes("lower(email) = 'info@dasoft.me'"), "Request Center schema must not pin manager lookup to one email");
expect(!schema.includes("'info@dasoft.me'"), "Request Center schema must not hardcode the delivery recipient");

console.log("request center UI contract: ok");
