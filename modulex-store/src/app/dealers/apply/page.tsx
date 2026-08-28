import type { Metadata } from "next";
import Link from "next/link";
import LeadForm from "@/components/leads/LeadForm";

export const metadata: Metadata = {
  title: "Dealer Application",
  description: "Apply to become an Oakwell Cabinetry dealer and share information about your business, showroom, and sales channels.",
  alternates: { canonical: "/dealers/apply" },
  openGraph: {
    title: "Dealer Application | Oakwell Cabinetry",
    description: "Apply to become an Oakwell Cabinetry dealer.",
    url: "/dealers/apply",
  },
};

export default function DealerApplicationPage() {
  return (
    <>
      <section className="page-header">
        <div className="header-bg-image" style={{ backgroundImage: "url('/assets/images/img(3).jpg')" }} />
        <div className="header-overlay" />
        <div className="container">
          <div className="row">
            <div className="header-content">
              <div className="bread-title"><h1>Dealer Application</h1></div>
              <nav className="breadcrumb" aria-label="Breadcrumb">
                <Link href="/">Home</Link>
                <span className="separator">/</span>
                <span className="current">Dealer Application</span>
              </nav>
            </div>
          </div>
        </div>
      </section>

      <section className="contact-section" aria-labelledby="dealer-application-heading">
        <div className="container">
          <div className="section-header text-center">
            <span className="section-tag">Dealer Network</span>
            <h2 id="dealer-application-heading">Become an Oakwell Dealer</h2>
            <p>Tell us about your company, showroom, sales channels, and the Oakwell product categories you are interested in.</p>
          </div>

          <div className="row justify-content-center">
            <div className="col-xl-9 col-lg-10">
              <div className="contact-form-wrapper">
                <LeadForm type="dealer_application" />
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
