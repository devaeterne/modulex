import path from "node:path";
import { ALLOWED_SOURCE_HOSTS, MAX_SOURCE_BYTES } from "./types.mjs";

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 5;

function validateSourceUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Invalid source URL: ${value}`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error(`Source URL must use HTTPS: ${value}`);
  }
  const hostname = parsed.hostname.toLowerCase();
  if (!ALLOWED_SOURCE_HOSTS.has(hostname)) {
    throw new Error(`Source host is not allowlisted: ${hostname}`);
  }
  return parsed;
}

function filenameFromUrl(value) {
  const parsed = new URL(value);
  const basename = path.posix.basename(parsed.pathname);
  return decodeURIComponent(basename || "source-image");
}

async function readBoundedBody(response) {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength) {
    const parsedLength = Number.parseInt(declaredLength, 10);
    if (Number.isFinite(parsedLength) && parsedLength > MAX_SOURCE_BYTES) {
      throw new Error("Source download exceeds 20 MB Content-Length limit.");
    }
  }

  if (!response.body) {
    throw new Error("Source response has no body.");
  }

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > MAX_SOURCE_BYTES) {
        await reader.cancel("GC-2 source exceeded 20 MB limit");
        throw new Error("Source download exceeds 20 MB streamed-byte limit.");
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks, total);
}

export async function downloadSource(sourceUrl, { fetchImpl = fetch } = {}) {
  if (typeof fetchImpl !== "function") throw new Error("fetchImpl must be a function.");

  let currentUrl = validateSourceUrl(sourceUrl).toString();
  let redirects = 0;

  while (true) {
    const response = await fetchImpl(currentUrl, {
      method: "GET",
      redirect: "manual",
      headers: {
        accept: "image/avif,image/webp,image/png,image/jpeg,*/*;q=0.1",
        "user-agent": "Oakwell-GC2-Media-Importer/1.0",
      },
    });

    if (REDIRECT_STATUSES.has(response.status)) {
      if (redirects >= MAX_REDIRECTS) {
        throw new Error(`Source download exceeded ${MAX_REDIRECTS} redirects.`);
      }
      const location = response.headers.get("location");
      if (!location) throw new Error("Source redirect is missing a Location header.");
      const nextUrl = new URL(location, currentUrl).toString();
      currentUrl = validateSourceUrl(nextUrl).toString();
      redirects += 1;
      continue;
    }

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Source download failed with HTTP ${response.status}.`);
    }

    const bytes = await readBoundedBody(response);
    return {
      bytes,
      finalUrl: currentUrl,
      contentType: (response.headers.get("content-type") || "").split(";", 1)[0].trim().toLowerCase(),
      filename: filenameFromUrl(currentUrl),
    };
  }
}
