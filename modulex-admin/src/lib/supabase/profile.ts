import { supabase } from "./client";

export type UserRole =
  | "super_admin"
  | "admin"
  | "sales"
  | "warehouse"
  | "shipping";

export type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

const PROFILE_CACHE_TTL_MS = 30_000;

async function loadCurrentProfile() {
  // The browser client already maintains and refreshes the authenticated session.
  // Reading that session is local and avoids an extra /auth/v1/user round-trip before
  // every profile lookup. Authorization is still enforced by the access token + RLS
  // when the profile row is requested from PostgREST.
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    return { profile: null, error: sessionError };
  }

  const user = session?.user ?? null;

  if (!user) {
    return { profile: null, error: null };
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return {
    profile: data as Profile | null,
    error,
  };
}

type CurrentProfileResult = Awaited<ReturnType<typeof loadCurrentProfile>>;

let cachedProfileResult: CurrentProfileResult | null = null;
let cachedAt = 0;
let inFlightProfileRequest: Promise<CurrentProfileResult> | null = null;
let authListenerInitialized = false;

export function clearCurrentProfileCache() {
  cachedProfileResult = null;
  cachedAt = 0;
  inFlightProfileRequest = null;
}

function ensureAuthCacheInvalidation() {
  if (authListenerInitialized || typeof window === "undefined") {
    return;
  }

  authListenerInitialized = true;

  supabase.auth.onAuthStateChange((event) => {
    if (
      event === "SIGNED_IN" ||
      event === "SIGNED_OUT" ||
      event === "USER_UPDATED" ||
      event === "PASSWORD_RECOVERY"
    ) {
      clearCurrentProfileCache();
    }
  });
}

export async function getCurrentProfile(options?: { fresh?: boolean }) {
  ensureAuthCacheInvalidation();

  const fresh = options?.fresh === true;
  const now = Date.now();

  if (
    !fresh &&
    cachedProfileResult &&
    now - cachedAt < PROFILE_CACHE_TTL_MS
  ) {
    return cachedProfileResult;
  }

  if (!fresh && inFlightProfileRequest) {
    return inFlightProfileRequest;
  }

  const request = loadCurrentProfile();
  inFlightProfileRequest = request;

  try {
    const result = await request;

    if (!result.error) {
      cachedProfileResult = result;
      cachedAt = Date.now();
    }

    return result;
  } finally {
    if (inFlightProfileRequest === request) {
      inFlightProfileRequest = null;
    }
  }
}
