import "server-only";

function configuredStoreOrigin() {
  const configured = process.env.STORE_SITE_URL || process.env.NEXT_PUBLIC_STORE_URL;
  if (!configured) {
    throw new Error("STORE_SITE_URL or NEXT_PUBLIC_STORE_URL must be configured for portal activation links.");
  }

  let parsed: URL;
  try {
    parsed = new URL(configured);
  } catch {
    throw new Error("Configured Store site URL is invalid.");
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Configured Store site URL must use http or https.");
  }
  if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error("Configured Store site URL must be an origin without path, query, or hash.");
  }

  return parsed.origin;
}

export function getStoreActivationUrl() {
  return new URL("/account/activate", `${configuredStoreOrigin()}/`).toString();
}
