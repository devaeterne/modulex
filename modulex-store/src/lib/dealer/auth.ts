import { redirect } from "next/navigation";
import { readStorePortalSession, type StorePortalContext } from "@/lib/portal/auth";

export type DealerPortalContext = StorePortalContext & { portal_kind: "dealer" };

export type DealerPortalSession = {
  hasAuthenticatedClaims: boolean;
  context: DealerPortalContext | null;
};

export function isDealerPortalContext(value: unknown): value is DealerPortalContext {
  if (!value || typeof value !== "object") return false;
  const context = value as Partial<DealerPortalContext>;
  return context.ok === true && context.reason === "authorized" && context.portal_kind === "dealer";
}

export async function readDealerPortalSession(): Promise<DealerPortalSession> {
  const session = await readStorePortalSession();
  const context = session.context?.portal_kind === "dealer" ? (session.context as DealerPortalContext) : null;
  return { hasAuthenticatedClaims: session.hasAuthenticatedClaims, context };
}

export async function requireDealerPortalContext(): Promise<DealerPortalContext> {
  const session = await readDealerPortalSession();
  if (session.context) return session.context;
  if (session.hasAuthenticatedClaims) redirect("/dealer/session/clear");
  redirect("/dealer/login");
}
