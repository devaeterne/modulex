import type { Metadata } from "next";
import DealerActivationForm from "./DealerActivationForm";

export const metadata: Metadata = {
  title: "Activate Dealer Account",
  description: "Complete your Oakwell Cabinetry dealer portal account setup.",
  robots: { index: false, follow: false },
};

export default function DealerActivatePage() {
  return (
    <section className="py-5">
      <div className="container py-5">
        <div className="row justify-content-center">
          <div className="col-12 col-md-8 col-lg-6 col-xl-5">
            <div className="border rounded-4 bg-white p-4 p-md-5 shadow-sm">
              <p className="text-uppercase small fw-semibold text-secondary mb-2">Dealer Portal</p>
              <h1 className="h2 mb-3">Activate your account</h1>
              <p className="text-secondary mb-4">
                Choose a password to complete your invitation. Dealer portal sign-in and account pages will be available in the next portal release.
              </p>
              <DealerActivationForm />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
