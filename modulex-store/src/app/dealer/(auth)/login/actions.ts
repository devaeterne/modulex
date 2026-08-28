"use server";

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isDealerPortalContext } from "@/lib/dealer/auth";

export type DealerLoginState = {
  error: string | null;
};

export const initialDealerLoginState: DealerLoginState = { error: null };

export async function dealerLoginAction(
  _previousState: DealerLoginState,
  formData: FormData,
): Promise<DealerLoginState> {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");

  if (!email || !password) {
    return { error: "Enter your email address and password." };
  }

  const supabase = await createServerSupabaseClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

  if (signInError) {
    return { error: "Unable to sign in with those credentials." };
  }

  const { data: claimData, error: claimError } = await supabase.auth.getClaims();
  const appMetadata = claimData?.claims?.app_metadata as Record<string, unknown> | undefined;

  if (claimError || appMetadata?.account_type !== "dealer_portal") {
    await supabase.auth.signOut({ scope: "local" });
    return { error: "Dealer portal access is unavailable." };
  }

  const { data: context, error: contextError } = await supabase.rpc("get_store_dealer_portal_context");
  if (contextError || !isDealerPortalContext(context)) {
    await supabase.auth.signOut({ scope: "local" });
    return { error: "Dealer portal access is unavailable." };
  }

  redirect("/dealer");
}
