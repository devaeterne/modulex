import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AccountLoginForm from "./AccountLoginForm";
import { readStorePortalSession } from "@/lib/portal/auth";

export const metadata: Metadata = { title: "Account Sign In", robots: { index: false, follow: false } };

export default async function AccountLoginPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const session = await readStorePortalSession();
  if (session.context) redirect(session.context.portal_kind === "dealer" ? "/dealer" : "/account");
  if (session.hasAuthenticatedClaims) redirect("/account/session/clear");

  const { status } = await searchParams;
  const statusMessage = status === "access-unavailable" ? "Account access is unavailable." : null;

  return (
    <section className="min-vh-100 bg-light py-5 d-flex align-items-center">
      <div className="container py-5">
        <div className="row justify-content-center">
          <div className="col-12 col-md-8 col-lg-6 col-xl-5">
            <div className="border rounded-4 bg-white p-4 p-md-5 shadow-sm">
              <p className="text-uppercase small fw-semibold text-secondary mb-2">Oakwell Account</p>
              <h1 className="h2 mb-3">Sign in</h1>
              <p className="text-secondary mb-4">Use the email and password for your Oakwell account.</p>
              {statusMessage ? <div className="alert alert-info" role="status">{statusMessage}</div> : null}
              <AccountLoginForm />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
