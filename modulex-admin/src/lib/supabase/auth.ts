import { supabase } from "./client";

export const MODULEX_AUTH_CHANNEL = "modulex-auth";
export const MODULEX_SIGNED_OUT_EVENT = "modulex:signed-out";

export async function signInWithEmail(email: string, password: string) {
  return supabase.auth.signInWithPassword({
    email,
    password,
  });
}

export async function signOut() {
  const result = await supabase.auth.signOut({ scope: "global" });

  if (!result.error && typeof window !== "undefined") {
    window.dispatchEvent(new Event(MODULEX_SIGNED_OUT_EVENT));

    if ("BroadcastChannel" in window) {
      const channel = new BroadcastChannel(MODULEX_AUTH_CHANNEL);
      channel.postMessage({ type: "SIGNED_OUT" });
      channel.close();
    }
  }

  return result;
}

export async function getCurrentSession() {
  return supabase.auth.getSession();
}

export async function getCurrentUser() {
  return supabase.auth.getUser();
}
