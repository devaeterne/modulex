export type SessionAttribution = {
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmContent: string;
  utmTerm: string;
  landingPage: string;
  referrer: string;
};

const ATTRIBUTION_KEY = "oakwell_session_attribution_v1";

function readCurrentCampaign() {
  const params = new URLSearchParams(window.location.search);
  return {
    utmSource: params.get("utm_source") || "",
    utmMedium: params.get("utm_medium") || "",
    utmCampaign: params.get("utm_campaign") || "",
    utmContent: params.get("utm_content") || "",
    utmTerm: params.get("utm_term") || "",
  };
}

function hasCampaign(values: ReturnType<typeof readCurrentCampaign>) {
  return Object.values(values).some(Boolean);
}

export function captureSessionAttribution() {
  if (typeof window === "undefined") return;

  try {
    const campaign = readCurrentCampaign();
    const existing = getSessionAttribution();

    if (existing && !hasCampaign(campaign)) return;

    const next: SessionAttribution = {
      ...(existing || {
        utmSource: "",
        utmMedium: "",
        utmCampaign: "",
        utmContent: "",
        utmTerm: "",
        landingPage: window.location.href,
        referrer: document.referrer || "",
      }),
      ...(hasCampaign(campaign)
        ? {
            ...campaign,
            landingPage: window.location.href,
            referrer: existing?.referrer || document.referrer || "",
          }
        : {}),
    };

    window.sessionStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(next));
  } catch {
    // Attribution is best-effort and must never block Store functionality.
  }
}

export function getSessionAttribution(): SessionAttribution | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(ATTRIBUTION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SessionAttribution>;
    return {
      utmSource: parsed.utmSource || "",
      utmMedium: parsed.utmMedium || "",
      utmCampaign: parsed.utmCampaign || "",
      utmContent: parsed.utmContent || "",
      utmTerm: parsed.utmTerm || "",
      landingPage: parsed.landingPage || window.location.href,
      referrer: parsed.referrer || "",
    };
  } catch {
    return null;
  }
}
