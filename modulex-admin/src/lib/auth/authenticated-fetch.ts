import { supabase } from "@/lib/supabase/client";

function requestWithToken(url: string, init: RequestInit | undefined, token: string) {
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(url, {
    ...init,
    headers,
    cache: "no-store",
  });
}

export async function authenticatedFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;

  const token = data.session?.access_token;
  if (!token) throw new Error("Session expired. Please sign in again.");

  let response = await requestWithToken(url, init, token);

  if (response.status === 401) {
    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    const refreshedToken = refreshed.session?.access_token;

    if (!refreshError && refreshedToken) {
      response = await requestWithToken(url, init, refreshedToken);
    }
  }

  const payload = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error || "Request failed.");
  }
  return payload;
}
