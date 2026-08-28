const LOCAL_SITE_URL = "http://localhost:3000";

function resolveSiteUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL;
  }

  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }

  return LOCAL_SITE_URL;
}

export const siteConfig = {
  name: "Oakwell Cabinetry",
  shortName: "Oakwell",
  description:
    "Oakwell Cabinetry presents cabinet collections, finishes, projects, technical resources, and dealer information.",
  url: resolveSiteUrl(),
  locale: "en_US",
  language: "en",
} as const;

export function getSiteUrl() {
  return new URL(siteConfig.url);
}
