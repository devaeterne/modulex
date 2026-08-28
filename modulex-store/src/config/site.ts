const DEFAULT_SITE_URL = "http://localhost:3000";

export const siteConfig = {
  name: "Oakwell Cabinetry",
  shortName: "Oakwell",
  description:
    "Oakwell Cabinetry presents cabinet collections, finishes, projects, technical resources, and dealer information.",
  url: process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_SITE_URL,
  locale: "en_US",
  language: "en",
} as const;

export function getSiteUrl() {
  return new URL(siteConfig.url);
}
