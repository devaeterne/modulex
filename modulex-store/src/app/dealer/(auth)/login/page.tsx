import type { Metadata } from "next";
import { redirect } from "next/navigation";
import PortalAuthShell from "@/components/portal/PortalAuthShell";
import { readDealerPortalSession } from "@/lib/dealer/auth";
import DealerLoginForm from "./DealerLoginForm";

export const metadata: Metadata = { title: "Dealer Sign In", robots: { index: false, follow: false } };

export default async function DealerLoginPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const session = await readDealerPortalSession();
  if (session.context) redirect("/dealer");
  if (session.hasAuthenticatedClaims) redirect("/dealer/session/clear");

  const { status } = await searchParams;
  const statusMessage = status === "password-reset"
    ? "Password updated. Sign in with your new password."
    : status === "access-unavailable"
      ? "Dealer portal access is unavailable."
      : null;

  return (
    <PortalAuthShell
      title="Dealer sign in"
      subtitle="Use the credentials connected to your activated Oakwell dealer account."
    >
      {statusMessage ? <div className="portal-alert" role="status">{statusMessage}</div> : null}
      <DealerLoginForm />
    </PortalAuthShell>
  );
}
