import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import JsonLd from "@/components/seo/JsonLd";
import { getStoreCabinetJourneyReadiness, type StorePublicPage } from "@/lib/store/content/queries";
import { resolveManagedSeoTitle } from "@/lib/seo/metadata";

export const revalidate = 60;

const FALLBACK_DESCRIPTION = "Learn how Oakwell Cabinetry approaches cabinet project planning, selection, design review, ordering and coordination.";

export async function generateMetadata(): Promise<Metadata> {
  try {
    const readiness = await getStoreCabinetJourneyReadiness();
    if (!readiness.isReady || !readiness.page) {
      return {
        title: "Cabinet Planning",
        description: FALLBACK_DESCRIPTION,
        alternates: { canonical: "/cabinet-process" },
        robots: { index: false, follow: true },
      };
    }
    const page = readiness.page;
    const image = page.ogImageUrl || page.heroImageUrl;
    return {
      title: resolveManagedSeoTitle(page.seoTitle, page.title),
      description: page.seoDescription || page.intro || FALLBACK_DESCRIPTION,
      alternates: { canonical: "/cabinet-process" },
      openGraph: image ? { images: [image] } : undefined,
    };
  } catch {
    return {
      title: "Cabinet Planning",
      description: FALLBACK_DESCRIPTION,
      alternates: { canonical: "/cabinet-process" },
      robots: { index: false, follow: true },
    };
  }
}

function PageCta({ page }: { page: StorePublicPage }) {
  if (!page.ctaLabel || !page.ctaHref) return null;
  if (page.ctaHref.startsWith("/")) {
    return <Link href={page.ctaHref} className="btn-primary">{page.ctaLabel}</Link>;
  }
  return <a href={page.ctaHref} className="btn-primary" target="_blank" rel="noopener noreferrer">{page.ctaLabel}</a>;
}

export default async function CabinetProcessPage() {
  const readiness = await getStoreCabinetJourneyReadiness().catch(() => null);
  if (!readiness?.isReady || !readiness.page) notFound();

  const { page, steps, faqs } = readiness;
  const faqJsonLd = faqs.length > 0 ? {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  } : null;

  return (
    <>
      {faqJsonLd ? <JsonLd data={faqJsonLd} /> : null}
      <section className="page-header">
        {page.heroImageUrl ? (
          <div
            className="header-bg-image"
            role={page.heroImageAlt ? "img" : undefined}
            aria-label={page.heroImageAlt || undefined}
            style={{ backgroundImage: `url('${page.heroImageUrl}')` }}
          />
        ) : null}
        <div className="header-overlay" />
        <div className="container">
          <div className="row">
            <div className="header-content">
              <div className="bread-title"><h1>{page.title}</h1></div>
              <nav className="breadcrumb" aria-label="Breadcrumb">
                <Link href="/">Home</Link>
                <span className="separator">/</span>
                <span className="current">Cabinet Planning</span>
              </nav>
            </div>
          </div>
        </div>
      </section>

      <section className="process-section">
        <div className="container py-5">
          <div className="section-header text-center">
            <span className="section-tag">{page.eyebrow || "CABINET PLANNING"}</span>
            <h2>{page.title}</h2>
            {page.intro ? <p>{page.intro}</p> : null}
          </div>

          <div className="process-timeline">
            {steps.map((step, index) => (
              <div className="process-step" key={step.id}>
                <div className="step-number">{String(index + 1).padStart(2, "0")}</div>
                <div className="step-content">
                  <h4>{step.title}</h4>
                  <p>{step.body}</p>
                </div>
              </div>
            ))}
          </div>

          {page.body ? <div className="about-content text-center mt-5"><p style={{ whiteSpace: "pre-line" }}>{page.body}</p></div> : null}
          {page.ctaLabel && page.ctaHref ? <div className="cta-buttons justify-content-center mt-4"><PageCta page={page} /></div> : null}
        </div>
      </section>

      {faqs.length > 0 ? (
        <section className="faq">
          <div className="container py-5">
            <div className="section-header text-center">
              <span className="section-tag">CABINET FAQ</span>
              <h2>Planning questions</h2>
              <p>Helpful answers for preparing and reviewing a cabinet project.</p>
            </div>
            <div className="services-grid mt-5">
              {faqs.map((faq) => (
                <article className="service-card" key={faq.id}>
                  <h3>{faq.question}</h3>
                  <p>{faq.answer}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      ) : null}
    </>
  );
}
