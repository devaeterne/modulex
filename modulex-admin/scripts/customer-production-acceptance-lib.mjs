export const DEFAULT_BASE_URL = "https://admin.oakwellcabinetry.com";
export const DEFAULT_CDP_ORIGIN = "http://127.0.0.1:9223";
const DEFAULT_TIMEOUT_MS = 30_000;

function normalizeHttpUrl(value, label) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid HTTP(S) URL.`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${label} must use http or https.`);
  }
  return url.toString().replace(/\/$/, "");
}

export function parseAcceptanceArgs(args) {
  const parsed = {
    baseUrl: DEFAULT_BASE_URL,
    cdpOrigin: DEFAULT_CDP_ORIGIN,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };

  for (const arg of args) {
    if (arg.startsWith("--base-url=")) {
      parsed.baseUrl = normalizeHttpUrl(arg.slice("--base-url=".length), "base URL");
      continue;
    }
    if (arg.startsWith("--cdp=")) {
      parsed.cdpOrigin = normalizeHttpUrl(arg.slice("--cdp=".length), "CDP origin");
      continue;
    }
    if (arg.startsWith("--timeout-ms=")) {
      const timeoutMs = Number(arg.slice("--timeout-ms=".length));
      if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 300_000) {
        throw new Error("timeout must be an integer between 1000 and 300000 milliseconds.");
      }
      parsed.timeoutMs = timeoutMs;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return parsed;
}

export function classifyCustomerLocation(locationHref) {
  let url;
  try {
    url = new URL(locationHref);
  } catch {
    return { authenticated: false, route: "" };
  }
  const route = url.pathname || "/";
  const normalized = route.toLowerCase();
  const authRoute = normalized === "/signin" || normalized === "/login" || normalized.startsWith("/auth/");
  return {
    authenticated: !authRoute && (normalized === "/customers" || normalized.startsWith("/customers/")),
    route,
  };
}

function isCustomerDataResource(name) {
  return /\/rest\/v1\/(?:customers(?:\?|$)|customer_[^/?]+)|\/rest\/v1\/rpc\/get_customer_dashboard(?:\?|$)/i.test(name);
}

function numeric(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

export function buildAuditSummary({
  locationHref,
  bodyText,
  navigation,
  resources,
  viewport,
  focusProbe,
  accessibility,
}) {
  const location = classifyCustomerLocation(locationHref);
  const customerResources = (resources ?? []).filter((entry) => isCustomerDataResource(String(entry?.name ?? "")));
  const customerDurations = customerResources.map((entry) => numeric(entry?.duration));
  const normalizedBody = String(bodyText ?? "");
  const focusTag = String(focusProbe?.tagName ?? "").toUpperCase();

  return {
    authenticated: location.authenticated,
    route: location.route,
    customerUiVisible: /\bCustomers\b/.test(normalizedBody) && /\bTotal Customers\b/.test(normalizedBody),
    navigationDurationMs: numeric(navigation?.duration),
    domContentLoadedMs: numeric(navigation?.domContentLoadedEventEnd),
    loadEventMs: numeric(navigation?.loadEventEnd),
    customerDataRequestCount: customerResources.length,
    maxCustomerRequestDurationMs: customerDurations.length ? Math.max(...customerDurations) : 0,
    horizontalPageOverflow: numeric(viewport?.scrollWidth) > numeric(viewport?.clientWidth) + 1,
    keyboardFocusReachedControl: Boolean(focusTag && focusTag !== "BODY" && focusTag !== "HTML"),
    focusedControl: focusTag ? {
      tagName: focusTag,
      text: String(focusProbe?.text ?? "").trim().slice(0, 160),
    } : null,
    unnamedInteractiveCount: Math.max(0, Math.trunc(numeric(accessibility?.unnamedInteractiveCount))),
  };
}
