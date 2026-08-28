import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import ts from "typescript";

function transpile(filePath) {
  const source = readFileSync(filePath, "utf8");
  return ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filePath,
  }).outputText;
}

function runModule(filePath, globals = {}) {
  const module = { exports: {} };
  const context = vm.createContext({
    module,
    exports: module.exports,
    URLSearchParams,
    ...globals,
    require(specifier) {
      throw new Error(`Unexpected runtime import in Store client smoke: ${specifier}`);
    },
  });
  vm.runInContext(transpile(filePath), context, { filename: filePath });
  return module.exports;
}

const checks = [];
function check(name, fn) {
  try {
    fn();
    checks.push({ name, ok: true });
    console.log(`✓ ${name}`);
  } catch (error) {
    checks.push({ name, ok: false, error });
    console.error(`✗ ${name} — ${error instanceof Error ? error.message : String(error)}`);
  }
}

console.log("=== Oakwell Store client behavior smoke ===\n");

const analyticsWindow = {};
const analytics = runModule(resolve(process.cwd(), "src/lib/analytics/events.ts"), {
  window: analyticsWindow,
});

check("Analytics events are blocked until consent exists", () => {
  assert.equal(analytics.pushAnalyticsEvent("page_view", { page: "/products" }), false);
  assert.equal(analyticsWindow.dataLayer, undefined);
});

check("Analytics consent emits a clean dataLayer event", () => {
  analyticsWindow.__oakwellConsent = { analytics: true, marketing: false };
  assert.equal(
    analytics.pushAnalyticsEvent("product_view", {
      sku: "SKU-1",
      empty: "",
      missing: null,
      ignored: undefined,
    }),
    true
  );
  const event = analyticsWindow.dataLayer.at(-1);
  assert.equal(event.event, "product_view");
  assert.equal(event.sku, "SKU-1");
  assert.equal("empty" in event, false);
  assert.equal("missing" in event, false);
  assert.equal("ignored" in event, false);
});

check("GA4 receives events only with analytics consent", () => {
  const calls = [];
  analyticsWindow.__oakwellAnalyticsMode = "ga4";
  analyticsWindow.gtag = (...args) => calls.push(args);
  analyticsWindow.__oakwellConsent = { analytics: false, marketing: true };
  analytics.pushAnalyticsEvent("contact_click", { location: "footer" });
  assert.equal(calls.length, 0);

  analyticsWindow.__oakwellConsent = { analytics: true, marketing: false };
  analytics.pushAnalyticsEvent("contact_click", { location: "navbar" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "event");
  assert.equal(calls[0][1], "contact_click");
  assert.equal(calls[0][2].location, "navbar");
});

check("Consent updates expose granted/denied state in dataLayer", () => {
  analytics.pushConsentEvent({ analytics: true, marketing: false });
  const event = analyticsWindow.dataLayer.at(-1);
  assert.equal(event.event, "oakwell_consent_update");
  assert.equal(event.analytics_consent, "granted");
  assert.equal(event.marketing_consent, "denied");
});

function makeSessionStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  };
}

const attributionWindow = {
  location: {
    search: "?utm_source=google&utm_medium=cpc&utm_campaign=summer&utm_content=hero&utm_term=cabinets",
    href: "https://oakwell.example/products?utm_source=google&utm_medium=cpc&utm_campaign=summer&utm_content=hero&utm_term=cabinets",
  },
  sessionStorage: makeSessionStorage(),
};
const attributionDocument = { referrer: "https://example.com/referrer" };
const attribution = runModule(resolve(process.cwd(), "src/lib/analytics/attribution.ts"), {
  window: attributionWindow,
  document: attributionDocument,
});

check("Initial UTM campaign and referrer are captured", () => {
  attribution.captureSessionAttribution();
  const captured = attribution.getSessionAttribution();
  assert.equal(captured.utmSource, "google");
  assert.equal(captured.utmMedium, "cpc");
  assert.equal(captured.utmCampaign, "summer");
  assert.equal(captured.landingPage, attributionWindow.location.href);
  assert.equal(captured.referrer, "https://example.com/referrer");
});

check("Navigation without campaign preserves session attribution", () => {
  attributionWindow.location.search = "";
  attributionWindow.location.href = "https://oakwell.example/contact";
  attributionDocument.referrer = "https://oakwell.example/products";
  attribution.captureSessionAttribution();
  const captured = attribution.getSessionAttribution();
  assert.equal(captured.utmCampaign, "summer");
  assert.match(captured.landingPage, /\/products\?/);
  assert.equal(captured.referrer, "https://example.com/referrer");
});

check("A later campaign updates UTM values but preserves original referrer", () => {
  attributionWindow.location.search = "?utm_source=newsletter&utm_campaign=fall";
  attributionWindow.location.href = "https://oakwell.example/dealers/apply?utm_source=newsletter&utm_campaign=fall";
  attribution.captureSessionAttribution();
  const captured = attribution.getSessionAttribution();
  assert.equal(captured.utmSource, "newsletter");
  assert.equal(captured.utmCampaign, "fall");
  assert.equal(captured.landingPage, attributionWindow.location.href);
  assert.equal(captured.referrer, "https://example.com/referrer");
});

const failed = checks.filter((item) => !item.ok);
console.log(`\nResult: ${checks.length - failed.length}/${checks.length} checks passed.`);
if (failed.length) process.exit(1);
console.log("=== STORE CLIENT SMOKE PASS ===");
