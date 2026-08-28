import type { Metadata } from "next";
import Link from "next/link";
import { getStorePublicCompanyProfile } from "@/lib/store/company/queries";

export const revalidate = 900;

export const metadata: Metadata = {
  title: "Contact",
  description: "Contact Oakwell Cabinetry for product information, dealer support, and general inquiries.",
  alternates: { canonical: "/contact" },
  openGraph: {
    title: "Contact | Oakwell Cabinetry",
    description: "Contact Oakwell Cabinetry for product information, dealer support, and general inquiries.",
    url: "/contact",
  },
};

function phoneHref(phone: string) {
  return `tel:${phone.replace(/[^+\d]/g, "")}`;
}

export default async function Contact() {
  let company = null;
  try {
    company = await getStorePublicCompanyProfile();
  } catch (error) {
    console.error("Unable to load public company contact details", error);
  }

  const companyName = company?.companyName || "Oakwell Cabinetry";
  const addressLines = [
    company?.addressLine1,
    company?.addressLine2,
    [company?.city, company?.stateRegion, company?.postalCode].filter(Boolean).join(", "),
  ].filter(Boolean) as string[];
  const hasDirectContact = Boolean(company?.email || company?.phone || company?.website || addressLines.length > 0);

  return (
    <>
      <section className="page-header">
        <div className="header-bg-image" style={{ backgroundImage: "url('/assets/images/img(1).jpg')" }} />
        <div className="header-overlay" />
        <div className="container">
          <div className="row">
            <div className="header-content">
              <div className="bread-title"><h1>Contact</h1></div>
              <nav className="breadcrumb" aria-label="Breadcrumb">
                <Link href="/">Home</Link>
                <span className="separator">/</span>
                <span className="current">Contact</span>
              </nav>
            </div>
          </div>
        </div>
      </section>

      <section className="contact-section" id="contact" aria-labelledby="contact-heading">
        <div className="container">
          <div className="section-header text-center">
            <span className="section-tag">{companyName}</span>
            <h2 id="contact-heading">Get in Touch</h2>
            <p>Contact our team for product information, cabinet specifications, dealer support, and general inquiries.</p>
          </div>

          <div className="row g-4 justify-content-center">
            {company?.email ? (
              <div className="col-lg-4 col-md-6">
                <div className="service-card h-100">
                  <div className="service-icon" aria-hidden="true"><i className="bi bi-envelope"></i></div>
                  <h3>Email</h3>
                  <p><a href={`mailto:${company.email}`}>{company.email}</a></p>
                </div>
              </div>
            ) : null}

            {company?.phone ? (
              <div className="col-lg-4 col-md-6">
                <div className="service-card h-100">
                  <div className="service-icon" aria-hidden="true"><i className="bi bi-telephone"></i></div>
                  <h3>Phone</h3>
                  <p><a href={phoneHref(company.phone)}>{company.phone}</a></p>
                </div>
              </div>
            ) : null}

            {addressLines.length > 0 ? (
              <div className="col-lg-4 col-md-6">
                <div className="service-card h-100">
                  <div className="service-icon" aria-hidden="true"><i className="bi bi-geo-alt"></i></div>
                  <h3>Location</h3>
                  <p>{addressLines.map((line, index) => <span key={`${line}-${index}`}>{line}{index < addressLines.length - 1 ? <br /> : null}</span>)}</p>
                </div>
              </div>
            ) : null}

            {company?.website ? (
              <div className="col-lg-4 col-md-6">
                <div className="service-card h-100">
                  <div className="service-icon" aria-hidden="true"><i className="bi bi-globe"></i></div>
                  <h3>Website</h3>
                  <p><a href={company.website} target="_blank" rel="noopener noreferrer">{company.website}</a></p>
                </div>
              </div>
            ) : null}
          </div>

          {!hasDirectContact ? (
            <div className="py-5 text-center">
              <h2 className="h4 mb-3">Contact details are being updated</h2>
              <p className="text-muted mb-0">Please check back shortly for official Oakwell Cabinetry contact information.</p>
            </div>
          ) : null}

          <div className="mt-5 text-center">
            <p className="text-muted mb-3">Online inquiry and dealer application forms are being prepared.</p>
            <Link href="/products" className="btn-primary">Explore Products</Link>
          </div>
        </div>
      </section>
    </>
  );
}
