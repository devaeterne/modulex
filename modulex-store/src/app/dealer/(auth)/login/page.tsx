import type { Metadata } from "next";
import { redirect } from "next/navigation";
import DealerLoginForm from "./DealerLoginForm";
import { readDealerPortalSession } from "@/lib/dealer/auth";

export const metadata: Metadata = {
  title: "Dealer Sign In",
};

export default async function DealerLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await readDealerPortalSession();

  if (session.context) {
    redirect("/dealer");
  }

  if (session.hasAuthenticatedClaims) {
    redirect("/dealer/session/clear");
  }

  const { status } = await searchParams;
  const statusMessage =
    status === "password-reset"
      ? "Password updated. Sign in with your new password."
      : status === "access-unavailable"
        ? "Dealer portal access is unavailable."
        : null;

  return (
    <section className="min-vh-100 bg-light py-5 d-flex align-items-center">
      <div className="container py-5">
        <div className="row justify-content-center">
          <div className="col-12 col-md-8 col-lg-6 col-xl-5">
            <div className="border rounded-4 bg-white p-4 p-md-5 shadow-sm">
              <p className="text-uppercase small fw-semibold text-secondary mb-2">Dealer Portal</p>
              <h1 className="h2 mb-3">Sign in</h1>
              <p className="text-secondary mb-4">Use the credentials from your activated dealer account.</p>
              {statusMessage ? <div className="alert alert-info" role="status">{statusMessage}</div> : null}
              <DealerLoginForm />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
