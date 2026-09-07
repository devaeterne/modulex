import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const libPath = path.join(root, "scripts/customer-production-acceptance-lib.mjs");
const runnerPath = path.join(root, "scripts/customer-production-acceptance.mjs");

assert.equal(
  fs.existsSync(libPath),
  true,
  "customer production acceptance must provide a dependency-free CDP helper library",
);
assert.equal(
  fs.existsSync(runnerPath),
  true,
  "customer production acceptance must provide a runnable CDP harness",
);

const {
  DEFAULT_BASE_URL,
  DEFAULT_CDP_ORIGIN,
  buildAuditSummary,
  classifyCustomerLocation,
  parseAcceptanceArgs,
} = await import(pathToFileURL(libPath).href);

assert.equal(DEFAULT_BASE_URL, "https://admin.oakwellcabinetry.com");
assert.equal(DEFAULT_CDP_ORIGIN, "http://127.0.0.1:9223");

assert.deepEqual(parseAcceptanceArgs([]), {
  baseUrl: DEFAULT_BASE_URL,
  cdpOrigin: DEFAULT_CDP_ORIGIN,
  timeoutMs: 30_000,
});
assert.deepEqual(
  parseAcceptanceArgs([
    "--base-url=https://preview.example.test",
    "--cdp=http://127.0.0.1:9333",
    "--timeout-ms=45000",
  ]),
  {
    baseUrl: "https://preview.example.test",
    cdpOrigin: "http://127.0.0.1:9333",
    timeoutMs: 45_000,
  },
);
assert.throws(
  () => parseAcceptanceArgs(["--timeout-ms=0"]),
  /timeout/i,
  "invalid timeout values must fail closed",
);
assert.throws(
  () => parseAcceptanceArgs(["--base-url=javascript:alert(1)"]),
  /http/i,
  "non-http base URLs must fail closed",
);

assert.deepEqual(
  classifyCustomerLocation("https://admin.oakwellcabinetry.com/customers"),
  { authenticated: true, route: "/customers" },
);
assert.equal(
  classifyCustomerLocation("https://admin.oakwellcabinetry.com/signin").authenticated,
  false,
  "sign-in redirects must never be accepted as authenticated evidence",
);
assert.equal(
  classifyCustomerLocation("https://admin.oakwellcabinetry.com/login").authenticated,
  false,
  "login redirects must never be accepted as authenticated evidence",
);

const audit = buildAuditSummary({
  locationHref: "https://admin.oakwellcabinetry.com/customers",
  bodyText: "Customers Total Customers Active Prospects Portal Enabled",
  navigation: {
    duration: 812.4,
    domContentLoadedEventEnd: 401.2,
    loadEventEnd: 790.1,
  },
  resources: [
    { name: "https://example.supabase.co/rest/v1/customers?select=*", duration: 71.3, initiatorType: "fetch" },
    { name: "https://example.supabase.co/rest/v1/rpc/get_customer_dashboard", duration: 64.2, initiatorType: "fetch" },
    { name: "https://admin.oakwellcabinetry.com/_next/static/chunks/app.js", duration: 20, initiatorType: "script" },
  ],
  viewport: {
    clientWidth: 390,
    scrollWidth: 390,
  },
  focusProbe: {
    tagName: "BUTTON",
    text: "Filters",
  },
  accessibility: {
    unnamedInteractiveCount: 0,
  },
});

assert.equal(audit.authenticated, true);
assert.equal(audit.customerUiVisible, true);
assert.equal(audit.customerDataRequestCount, 2);
assert.equal(audit.horizontalPageOverflow, false);
assert.equal(audit.keyboardFocusReachedControl, true);
assert.equal(audit.unnamedInteractiveCount, 0);
assert.ok(audit.maxCustomerRequestDurationMs >= 71.3);

const runnerSource = fs.readFileSync(runnerPath, "utf8");
assert.match(runnerSource, /\/json\/list/);
assert.match(runnerSource, /Page\.navigate/);
assert.match(runnerSource, /Runtime\.evaluate/);
assert.match(runnerSource, /Emulation\.setDeviceMetricsOverride/);
assert.match(runnerSource, /Emulation\.setEmulatedMedia/);
assert.match(runnerSource, /Input\.dispatchKeyEvent/);
assert.doesNotMatch(runnerSource, /SMOKE_(EMAIL|PASSWORD)|SUPABASE_SERVICE_ROLE|service_role/i);
assert.doesNotMatch(runnerSource, /Network\.setCookie|Storage\.setCookies/);
assert.doesNotMatch(runnerSource, /method:\s*["'](?:POST|PATCH|PUT|DELETE)["']/i);

console.log("PASS: Customer production acceptance harness contract");
