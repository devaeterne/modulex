import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type PortalKind = "dealer" | "customer";

export type StorePortalContext = {
  ok: true;
  reason: "authorized";
  portal_user_id: string;
  customer_id: string;
  customer_name: string;
  customer_status: string;
  customer_type: string;
  portal_role: "admin" | "buyer" | "viewer";
  portal_kind: PortalKind;
};

export type StorePortalSession = {
  hasAuthenticatedClaims: boolean;
  accountType: "dealer_portal" | "customer_portal" | null;
  context: StorePortalContext | null;
};

export function isStorePortalContext(value: unknown): value is StorePortalContext {
  if (!value || typeof value !== "object") return false;
  const context = value as Partial<StorePortalContext>;
  return (
    context.ok === true &&
    context.reason === "authorized" &&
    typeof context.portal_user_id === "string" &&
    typeof context.customer_id === "string" &&
    typeof context.customer_name === "string" &&
    typeof context.customer_status === "string" &&
    typeof context.customer_type === "string" &&
    (context.portal_role === "admin" || context.portal_role === "buyer" || context.portal_role === "viewer") &&
    (context.portal_kind === "dealer" || context.portal_kind === "customer")
  );
}

function accountTypeForKind(kind: PortalKind) {
  return kind === "dealer" ? "dealer_portal" : "customer_portal";
}

export async function readStorePortalSession(): Promise<StorePortalSession> {
  const supabase = await createServerSupabaseClient();
  const { data: claimData, error: claimError } = await supabase.auth.getClaims();

  if (claimError || !claimData?.claims) {
    return { hasAuthenticatedClaims: false, accountType: null, context: null };
  }

  const appMetadata = claimData.claims.app_metadata as Record<string, unknown> | undefined;
  const rawAccountType = appMetadata?.account_type;
  const accountType = rawAccountType === "dealer_portal" || rawAccountType === "customer_portal" ? rawAccountType : null;
  if (!accountType) {
    return { hasAuthenticatedClaims: true, accountType: null, context: null };
  }

  const { data, error } = await supabase.rpc("get_store_portal_context");
  if (error || !isStorePortalContext(data)) {
    return { hasAuthenticatedClaims: true, accountType, context: null };
  }

  if (accountTypeForKind(data.portal_kind) !== accountType) {
    return { hasAuthenticatedClaims: true, accountType, context: null };
  }

  return { hasAuthenticatedClaims: true, accountType, context: data };
}

export async function requireStorePortalContext(kind?: PortalKind): Promise<StorePortalContext> {
  const session = await readStorePortalSession();

  if (session.context) {
    if (!kind || session.context.portal_kind === kind) return session.context;
    redirect(session.context.portal_kind === "dealer" ? "/dealer" : "/account");
  }

  if (session.hasAuthenticatedClaims) {
    redirect("/account/session/clear");
  }

  redirect("/account/login");
}

export async function requireCustomerPortalContext() {
  return requireStorePortalContext("customer");
}

export async function requireDealerStorePortalContext() {
  return requireStorePortalContext("dealer");
}
