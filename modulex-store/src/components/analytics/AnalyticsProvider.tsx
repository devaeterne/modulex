"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import type { StoreMarketingSettings } from "@/lib/store/marketing/queries";
import {
  pushAnalyticsEvent,
  pushConsentEvent,
  type AnalyticsConsentState,
} from "@/lib/analytics/events";
import { captureSessionAttribution } from "@/lib/analytics/attribution";

const CONSENT_KEY = "oakwell_privacy_consent_v1";
const DENIED: AnalyticsConsentState = { analytics: false, marketing: false };

function ensureGoogleCommandQueue() {
  window.dataLayer = window.dataLayer || [];
  if (typeof window.gtag === "function") return;

  window.gtag = function gtag() {
    window.dataLayer?.push(arguments);
  };
}

function updateGoogleConsent(consent: AnalyticsConsentState) {
  ensureGoogleCommandQueue();
  window.gtag?.("consent", "update", {
    analytics_storage: consent.analytics ? "granted" : "denied",
    ad_storage: consent.marketing ? "granted" : "denied",
    ad_user_data: consent.marketing ? "granted" : "denied",
    ad_personalization: consent.marketing ? "granted" : "denied",
  });
}

function initializeDeniedGoogleConsent() {
  ensureGoogleCommandQueue();
  window.gtag?.("consent", "default", {
    analytics_storage: "denied",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    wait_for_update: 500,
  });
}

function loadGoogleTagManager(containerId: string) {
  if (document.getElementById("oakwell-google-tag-manager")) {
    window.__oakwellAnalyticsMode = "gtm";
    return;
  }

  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });

  const script = document.createElement("script");
  script.id = "oakwell-google-tag-manager";
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(containerId)}`;
  document.head.appendChild(script);
  window.__oakwellAnalyticsMode = "gtm";
}

function loadDirectGa4(measurementId: string) {
  if (document.getElementById("oakwell-google-analytics")) {
    window.__oakwellAnalyticsMode = "ga4";
    return;
  }

  ensureGoogleCommandQueue();
  const script = document.createElement("script");
  script.id = "oakwell-google-analytics";
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  document.head.appendChild(script);

  window.gtag?.("js", new Date());
  window.gtag?.("config", measurementId, { send_page_view: false });
  window.__oakwellAnalyticsMode = "ga4";
}

function readStoredConsent(): AnalyticsConsentState | null {
  try {
    const raw = window.localStorage.getItem(CONSENT_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<AnalyticsConsentState>;
    if (typeof value.analytics !== "boolean" || typeof value.marketing !== "boolean") return null;
    return { analytics: value.analytics, marketing: value.marketing };
  } catch {
    return null;
  }
}

function storeConsent(consent: AnalyticsConsentState) {
  try {
    window.localStorage.setItem(CONSENT_KEY, JSON.stringify(consent));
  } catch {
    // Consent still applies for the current page even when storage is unavailable.
  }
}

export default function AnalyticsProvider({
  settings,
}: {
  settings: StoreMarketingSettings | null;
}) {
  const pathname = usePathname();
  const [consent, setConsent] = useState<AnalyticsConsentState | null>(null);
  const [bannerOpen, setBannerOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [draftConsent, setDraftConsent] = useState<AnalyticsConsentState>(DENIED);
  const lastPageView = useRef<string | null>(null);

  useEffect(() => {
    captureSessionAttribution();
    initializeDeniedGoogleConsent();

    if (!settings?.trackingEnabled) {
      window.__oakwellConsent = DENIED;
      window.__oakwellAnalyticsMode = "disabled";
      setConsent(DENIED);
      return;
    }

    const doNotTrack = settings.respectDoNotTrack && navigator.doNotTrack === "1";
    if (doNotTrack) {
      window.__oakwellConsent = DENIED;
      window.__oakwellAnalyticsMode = "disabled";
      setConsent(DENIED);
      setBannerOpen(false);
      return;
    }

    const stored = readStoredConsent();
    if (stored) {
      setConsent(stored);
      setDraftConsent(stored);
      setBannerOpen(false);
      return;
    }

    setConsent(DENIED);
    setDraftConsent(DENIED);
    setBannerOpen(settings.consentBannerEnabled);
  }, [settings]);

  useEffect(() => {
    captureSessionAttribution();
  }, [pathname]);

  useEffect(() => {
    if (!settings?.trackingEnabled || !consent) return;

    window.__oakwellConsent = consent;
    updateGoogleConsent(consent);
    pushConsentEvent(consent);

    if (!consent.analytics && !consent.marketing) {
      window.__oakwellAnalyticsMode = "disabled";
      return;
    }

    if (settings.googleTagManagerId) {
      loadGoogleTagManager(settings.googleTagManagerId);
    } else if (consent.analytics && settings.googleAnalyticsMeasurementId) {
      loadDirectGa4(settings.googleAnalyticsMeasurementId);
    } else {
      window.__oakwellAnalyticsMode = "disabled";
    }

    if (consent.analytics && lastPageView.current !== pathname) {
      lastPageView.current = pathname;
      pushAnalyticsEvent("page_view", {
        page_path: pathname,
        page_title: document.title,
      });
    }
  }, [consent, pathname, settings]);

  if (!settings?.trackingEnabled || !settings.consentBannerEnabled) return null;

  function applyChoice(next: AnalyticsConsentState) {
    storeConsent(next);
    setConsent(next);
    setDraftConsent(next);
    setBannerOpen(false);
    setManageOpen(false);
  }

  return (
    <>
      {bannerOpen ? (
        <div
          className="position-fixed bottom-0 start-0 w-100 p-3 p-md-4"
          style={{ zIndex: 1100, pointerEvents: "none" }}
          role="dialog"
          aria-modal="false"
          aria-labelledby="oakwell-consent-title"
        >
          <div
            className="mx-auto rounded-3 border bg-white p-4 shadow-lg"
            style={{ maxWidth: 760, pointerEvents: "auto" }}
          >
            <h2 id="oakwell-consent-title" className="h5 mb-2">
              {settings.consentTitle}
            </h2>
            <p className="text-muted mb-3">{settings.consentDescription}</p>

            {manageOpen ? (
              <div className="mb-3 rounded-3 border p-3">
                <div className="d-flex flex-column gap-3">
                  <label className="d-flex align-items-start gap-2">
                    <input
                      className="mt-1"
                      type="checkbox"
                      checked={draftConsent.analytics}
                      onChange={(event) =>
                        setDraftConsent((current) => ({ ...current, analytics: event.target.checked }))
                      }
                    />
                    <span>
                      <strong className="d-block">Analytics</strong>
                      <span className="small text-muted">
                        Helps us understand which pages and product content are useful. Form field values are not sent as analytics events.
                      </span>
                    </span>
                  </label>
                  <label className="d-flex align-items-start gap-2">
                    <input
                      className="mt-1"
                      type="checkbox"
                      checked={draftConsent.marketing}
                      onChange={(event) =>
                        setDraftConsent((current) => ({ ...current, marketing: event.target.checked }))
                      }
                    />
                    <span>
                      <strong className="d-block">Marketing</strong>
                      <span className="small text-muted">
                        Allows configured marketing tags to measure campaigns and conversions through Google Tag Manager.
                      </span>
                    </span>
                  </label>
                </div>
              </div>
            ) : null}

            <div className="d-flex flex-wrap gap-2 align-items-center">
              <button type="button" className="btn btn-dark" onClick={() => applyChoice({ analytics: true, marketing: true })}>
                {settings.acceptAllLabel}
              </button>
              <button type="button" className="btn btn-outline-secondary" onClick={() => applyChoice(DENIED)}>
                {settings.rejectOptionalLabel}
              </button>
              {manageOpen ? (
                <button type="button" className="btn btn-outline-dark" onClick={() => applyChoice(draftConsent)}>
                  {settings.saveChoicesLabel}
                </button>
              ) : (
                <button type="button" className="btn btn-link" onClick={() => setManageOpen(true)}>
                  {settings.manageChoicesLabel}
                </button>
              )}
              {settings.privacyPolicyHref ? (
                <a className="btn btn-link ms-md-auto" href={settings.privacyPolicyHref}>
                  Privacy policy
                </a>
              ) : null}
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary position-fixed start-0 bottom-0 m-3 bg-white"
          style={{ zIndex: 1050 }}
          onClick={() => {
            setDraftConsent(consent || DENIED);
            setManageOpen(true);
            setBannerOpen(true);
          }}
        >
          {settings.manageChoicesLabel}
        </button>
      )}
    </>
  );
}
