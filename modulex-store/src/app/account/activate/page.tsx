import type { Metadata } from "next";
import Link from "next/link";
import AccountActivationForm from "./AccountActivationForm";

export const metadata: Metadata = { title: "Activate Account", robots: { index: false, follow: false } };

export default function AccountActivationPage() {
  return (
    <section className="min-vh-100 bg-light py-5 d-flex align-items-center">
      <div className="container py-5"><div className="row justify-content-center"><div className="col-12 col-md-8 col-lg-6 col-xl-5"><div className="border rounded-4 bg-white p-4 p-md-5 shadow-sm"><p className="text-uppercase small fw-semibold text-secondary mb-2">Oakwell Account</p><h1 className="h2 mb-3">Activate account</h1><p className="text-secondary mb-4">Choose a password to complete your secure account activation.</p><AccountActivationForm/><div className="text-center mt-4"><Link href="/account/login" className="small text-secondary">Back to sign in</Link></div></div></div></div></div>
    </section>
  );
}
