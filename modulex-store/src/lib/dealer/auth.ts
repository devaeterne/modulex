import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type DealerPortalContext = {
  ok: true;
  reason: "authorized";
  portal_user_id: string;
  customer_id: string;
  customer_name: string;
  customer_status: string;
  portal_role: "admin" | "buyer" | "viewer";
};

export type DealerPortalSession = {
  hasAuthenticatedClaims: boolean;
  context: DealerPortalContext | null;
};

export function isDealerPortalContext(value: unknown): value is DealerPortalContext {
  if (!value || typeof value !== "object") return false;

  const context = value as Partial<DealerPortalContext>;
  return (
    context.ok === true &&
    context.reason === "authorized" &&
    typeof context.portal_user_id === "string" &&
    typeof context.customer_id === "string" &&
    typeof context.customer_name === "string" &&
    typeof context.customer_status === "string" &&
    (context.portal_role === "admin" || context.portal_role === "buyer" || context.portal_role === "viewer")
  );
}

export async function readDealerPortalSession(): Promise<DealerPortalSession> {
  const supabase = await createServerSupabaseClient();
  const { data: claimData, error: claimError } = await supabase.auth.getClaims();

  if (claimError || !claimData?.claims) {
    return { hasAuthenticatedClaims: false, context: null };
  }

  const appMetadata = claimData.claims.app_metadata as Record<string, unknown> | undefined;
  if (appMetadata?.account_type !== "dealer_portal") {
    return { hasAuthenticatedClaims: true, context: null };
  }

  const { data, error } = await supabase.rpc("get_store_dealer_portal_context");
  if (error || !isDealerPortalContext(data)) {
    return { hasAuthenticatedClaims: true, context: null };
  }

  return { hasAuthenticatedClaims: true, context: data };
}

export async function requireDealerPortalContext(): Promise<DealerPortalContext> {
  const session = await readDealerPortalSession();

  if (session.context) {
    return session.context;
  }

  if (session.hasAuthenticatedClaims) {
    redirect("/dealer/session/clear");
  }

  redirect("/dealer/login");
}
