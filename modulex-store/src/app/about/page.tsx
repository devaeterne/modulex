import type { Metadata } from "next";
import Link from "next/link";
import {
  getStorePublicCompanyProfile,
  type StorePublicCompanyProfile,
} from "@/lib/store/company/queries";

export const revalidate = 900;

export const metadata: Metadata = {
  title: "About",
  description: "Learn about Oakwell Cabinetry and find verified company contact information.",
  alternates: { canonical: "/about" },
};

function phoneHref(phone: string) {
  return `tel:${phone.replace(/[^+\d]/g, "")}`;
}

export default async function About() {
  let company: StorePublicCompanyProfile | null = null;

  try {
    company = await getStorePublicCompanyProfile();
  } catch (error) {
    console.error("Unable to load public company profile for About page", error);
  }

  const companyName = company?.companyName || "Oakwell Cabinetry";
  const addressLines = [
    company?.addressLine1,
    company?.addressLine2,
    [company?.city, company?.stateRegion, company?.postalCode].filter(Boolean).join(", "),
    company?.countryCode,
  ].filter((line): line is string => Boolean(line));

  return (
    <>
      <section className="page-header">
        <div
          className="header-bg-image"
          style={{ backgroundImage: "url('/assets/images/img(7).jpg')" }}
        ></div>
        <div className="header-overlay"></div>
        <div className="container">
          <div className="row">
            <div className="header-content">
              <div className="bread-title">
                <h1>About {companyName}</h1>
              </div>
              <nav className="breadcrumb" aria-label="Breadcrumb">
                <Link href="/">Home</Link>
                <span className="separator">/</span>
                <span className="current">About</span>
              </nav>
            </div>
          </div>
        </div>
      </section>

      <section className="about-story grad">
        <div className="container py-5">
          <div className="row justify-content-center">
            <div className="col-lg-9">
              <div className="about-content text-center">
                <span className="section-tag p-0">{companyName}</span>
                <h2>Cabinet products and support from Oakwell Cabinetry</h2>
                <p>
                  This website provides published Oakwell Cabinetry product information,
                  finish options, dealer resources, and ways to contact the company.
                </p>
                <div className="cta-buttons justify-content-center mt-4">
                  <Link href="/products" className="btn-primary">
                    Explore Products
                  </Link>
                  <Link href="/contact" className="btn-outline">
                    Contact Us
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {(company?.email || company?.phone || addressLines.length > 0 || company?.website) ? (
        <section className="process-section">
          <div className="container py-5">
            <div className="section-header text-center">
              <span className="section-tag">Company Information</span>
              <h2>Verified contact details</h2>
            </div>
            <div className="row justify-content-center">
              <div className="col-lg-8">
                <div className="text-center">
                  {company?.email ? (
                    <p>
                      <strong>Email:</strong>{" "}
                      <a href={`mailto:${company.email}`}>{company.email}</a>
                    </p>
                  ) : null}
                  {company?.phone ? (
                    <p>
                      <strong>Phone:</strong>{" "}
                      <a href={phoneHref(company.phone)}>{company.phone}</a>
                    </p>
                  ) : null}
                  {addressLines.length > 0 ? (
                    <address className="mb-3">
                      {addressLines.map((line) => (
                        <div key={line}>{line}</div>
                      ))}
                    </address>
                  ) : null}
                  {company?.website ? (
                    <p>
                      <a href={company.website} target="_blank" rel="noopener noreferrer">
                        Company Website
                      </a>
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </section>
      ) : null}
    </>
  );
}
