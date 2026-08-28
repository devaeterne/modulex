export type AnalyticsConsentState = {
  analytics: boolean;
  marketing: boolean;
};

export type StoreAnalyticsEventName =
  | "page_view"
  | "product_view"
  | "search"
  | "catalog_download"
  | "contact_form_start"
  | "contact_form_submit"
  | "dealer_application_start"
  | "dealer_application_submit"
  | "contact_click"
  | "phone_click"
  | "email_click"
  | "login"
  | "portal_view";

export type StoreAnalyticsPayload = Record<
  string,
  string | number | boolean | null | undefined
>;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    __oakwellAnalyticsMode?: "disabled" | "gtm" | "ga4";
    __oakwellConsent?: AnalyticsConsentState;
  }
}

function cleanPayload(payload: StoreAnalyticsPayload) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined && value !== null && value !== "")
  );
}

export function pushAnalyticsEvent(
  event: StoreAnalyticsEventName,
  payload: StoreAnalyticsPayload = {}
): boolean {
  if (typeof window === "undefined") return false;

  const consent = window.__oakwellConsent;
  if (!consent || (!consent.analytics && !consent.marketing)) return false;

  const clean = cleanPayload(payload);
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event, ...clean });

  if (
    window.__oakwellAnalyticsMode === "ga4" &&
    consent.analytics &&
    typeof window.gtag === "function"
  ) {
    window.gtag("event", event, clean);
  }

  return true;
}

export function pushConsentEvent(consent: AnalyticsConsentState) {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({
    event: "oakwell_consent_update",
    analytics_consent: consent.analytics ? "granted" : "denied",
    marketing_consent: consent.marketing ? "granted" : "denied",
  });
}
