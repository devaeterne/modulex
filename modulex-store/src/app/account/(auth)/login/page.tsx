import type { Metadata } from "next";
import { redirect } from "next/navigation";
import PortalAuthShell from "@/components/portal/PortalAuthShell";
import { readStorePortalSession } from "@/lib/portal/auth";
import AccountLoginForm from "./AccountLoginForm";

export const metadata: Metadata = { title: "Account Sign In", robots: { index: false, follow: false } };

export default async function AccountLoginPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const session = await readStorePortalSession();
  if (session.context) redirect(session.context.portal_kind === "dealer" ? "/dealer" : "/account");
  if (session.hasAuthenticatedClaims) redirect("/account/session/clear");

  const { status } = await searchParams;
  const statusMessage = status === "access-unavailable" ? "Account access is unavailable." : null;

  return (
    <PortalAuthShell
      title="Sign in"
      subtitle="Use the email and password connected to your Oakwell account."
    >
      {statusMessage ? <div className="portal-alert" role="status">{statusMessage}</div> : null}
      <AccountLoginForm />
    </PortalAuthShell>
  );
}
