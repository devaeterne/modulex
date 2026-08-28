import type { Metadata } from "next";
import DealerForgotPasswordForm from "./DealerForgotPasswordForm";

export const metadata: Metadata = {
  title: "Dealer Password Reset",
};

export default function DealerForgotPasswordPage() {
  return (
    <section className="min-vh-100 bg-light py-5 d-flex align-items-center">
      <div className="container py-5">
        <div className="row justify-content-center">
          <div className="col-12 col-md-8 col-lg-6 col-xl-5">
            <div className="border rounded-4 bg-white p-4 p-md-5 shadow-sm">
              <p className="text-uppercase small fw-semibold text-secondary mb-2">Dealer Portal</p>
              <h1 className="h2 mb-3">Reset your password</h1>
              <p className="text-secondary mb-4">
                Enter your dealer account email. If the account is eligible, we will send a secure reset link.
              </p>
              <DealerForgotPasswordForm />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
