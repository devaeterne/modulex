import type { Metadata } from "next";
import Link from "next/link";
import {
  getStorePublicCompanyProfile,
  type StorePublicCompanyProfile,
} from "@/lib/store/company/queries";
import { getStorePublicPage, type StorePublicPage } from "@/lib/store/content/queries";
import { resolveManagedSeoTitle } from "@/lib/seo/metadata";

export const revalidate = 900;

const FALLBACK_DESCRIPTION =
  "Learn about Oakwell Cabinetry and find verified company contact information.";

const FALLBACK_METADATA: Metadata = {
  title: "About",
  description: FALLBACK_DESCRIPTION,
  alternates: { canonical: "/about" },
};

export async function generateMetadata(): Promise<Metadata> {
  try {
    const page = await getStorePublicPage("about");
    if (!page) return FALLBACK_METADATA;

    const image = page.ogImageUrl || page.heroImageUrl;
    return {
      title: resolveManagedSeoTitle(page.seoTitle, page.title),
      description: page.seoDescription || page.intro || FALLBACK_DESCRIPTION,
      alternates: { canonical: "/about" },
      openGraph: image ? { images: [image] } : undefined,
    };
  } catch {
    return FALLBACK_METADATA;
  }
}

function phoneHref(phone: string) {
  return `tel:${phone.replace(/[^+\d]/g, "")}`;
}

function PageCta({ page }: { page: StorePublicPage }) {
  if (!page.ctaLabel || !page.ctaHref) return null;

  if (page.ctaHref.startsWith("/")) {
    return (
      <Link href={page.ctaHref} className="btn-primary">
        {page.ctaLabel}
      </Link>
    );
  }

  return (
    <a href={page.ctaHref} className="btn-primary" target="_blank" rel="noopener noreferrer">
      {page.ctaLabel}
    </a>
  );
}

export default async function About() {
  const [companyResult, pageResult] = await Promise.allSettled([
    getStorePublicCompanyProfile(),
    getStorePublicPage("about"),
  ]);

  const company: StorePublicCompanyProfile | null =
    companyResult.status === "fulfilled" ? companyResult.value : null;
  const aboutPage = pageResult.status === "fulfilled" ? pageResult.value : null;

  if (companyResult.status === "rejected") {
    console.error("Unable to load public company profile for About page");
  }
  if (pageResult.status === "rejected") {
    console.error("Unable to load published About CMS content");
  }

  const companyName = company?.companyName || "Oakwell Cabinetry";
  const addressLines = [
    company?.addressLine1,
    company?.addressLine2,
    [company?.city, company?.stateRegion, company?.postalCode].filter(Boolean).join(", "),
    company?.countryCode,
  ].filter((line): line is string => Boolean(line));

  const heroImage = aboutPage?.heroImageUrl || "/assets/images/img(7).jpg";
  const pageTitle = aboutPage?.title || `About ${companyName}`;

  return (
    <>
      <section className="page-header">
        <div
          className="header-bg-image"
          role={aboutPage?.heroImageAlt ? "img" : undefined}
          aria-label={aboutPage?.heroImageAlt || undefined}
          style={{ backgroundImage: `url('${heroImage}')` }}
        ></div>
        <div className="header-overlay"></div>
        <div className="container">
          <div className="row">
            <div className="header-content">
              <div className="bread-title">
                <h1>{pageTitle}</h1>
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
                <span className="section-tag p-0">{aboutPage?.eyebrow || companyName}</span>
                <h2>{aboutPage?.title || "Cabinet products and support from Oakwell Cabinetry"}</h2>
                {aboutPage?.intro ? <p>{aboutPage.intro}</p> : null}
                {aboutPage?.body ? <p style={{ whiteSpace: "pre-line" }}>{aboutPage.body}</p> : null}
                {!aboutPage ? (
                  <p>
                    This website provides published Oakwell Cabinetry product information,
                    finish options, dealer resources, and ways to contact the company.
                  </p>
                ) : null}
                <div className="cta-buttons justify-content-center mt-4">
                  {aboutPage ? (
                    <PageCta page={aboutPage} />
                  ) : (
                    <>
                      <Link href="/products" className="btn-primary">
                        Explore Products
                      </Link>
                      <Link href="/contact" className="btn-outline">
                        Contact Us
                      </Link>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {company?.email || company?.phone || addressLines.length > 0 ? (
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
                </div>
              </div>
            </div>
          </div>
        </section>
      ) : null}
    </>
  );
}
