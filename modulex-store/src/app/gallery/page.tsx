import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import StoreProjectsGallery, {
  type StoreProjectGalleryEntry,
} from "@/components/gallery/StoreProjectsGallery";
import {
  getStoreGalleryReadiness,
  getStorePublicProjectMedia,
} from "@/lib/store/content/queries";
import { resolveManagedSeoTitle } from "@/lib/seo/metadata";

export const revalidate = 60;

const UNAVAILABLE_METADATA: Metadata = {
  title: "Projects",
  description: "Oakwell Cabinetry project gallery.",
  alternates: { canonical: "/gallery" },
  robots: { index: false, follow: false },
};

export async function generateMetadata(): Promise<Metadata> {
  try {
    const readiness = await getStoreGalleryReadiness();
    if (!readiness.isReady || !readiness.page) return UNAVAILABLE_METADATA;

    const page = readiness.page;
    const image = page.ogImageUrl || page.heroImageUrl || readiness.projects[0]?.coverImageUrl;
    return {
      title: resolveManagedSeoTitle(page.seoTitle, page.title),
      description: page.seoDescription || page.intro || "Oakwell Cabinetry projects.",
      alternates: { canonical: "/gallery" },
      openGraph: image ? { images: [image] } : undefined,
    };
  } catch {
    return UNAVAILABLE_METADATA;
  }
}

function GalleryCta({ label, href }: { label: string; href: string }) {
  if (href.startsWith("/")) {
    return <Link href={href} className="btn-primary">{label}</Link>;
  }
  return <a href={href} className="btn-primary" target="_blank" rel="noopener noreferrer">{label}</a>;
}

export default async function GalleryPage() {
  let readiness;
  try {
    readiness = await getStoreGalleryReadiness();
  } catch {
    console.error("Unable to determine published Gallery readiness");
    notFound();
  }

  if (!readiness.isReady || !readiness.page) notFound();

  const entries: StoreProjectGalleryEntry[] = await Promise.all(
    readiness.projects.map(async (project) => {
      try {
        return { project, media: await getStorePublicProjectMedia(project.slug) };
      } catch {
        console.error("Unable to load one published project media set");
        return { project, media: [] };
      }
    })
  );

  const page = readiness.page;
  return (
    <>
      <section className="page-header">
        {page.heroImageUrl ? (
          <div className="header-bg-image" role={page.heroImageAlt ? "img" : undefined} aria-label={page.heroImageAlt || undefined} style={{ backgroundImage: `url('${page.heroImageUrl}')` }}></div>
        ) : null}
        <div className="header-overlay"></div>
        <div className="container"><div className="row"><div className="header-content"><div className="bread-title"><h1>{page.title}</h1></div><nav className="breadcrumb" aria-label="Breadcrumb"><Link href="/">Home</Link><span className="separator">/</span><span className="current">Projects</span></nav></div></div></div>
      </section>
      <section className="grad">
        <div className="container py-5">
          <div className="row justify-content-center mb-5"><div className="col-lg-9 text-center">
            {page.eyebrow ? <span className="section-tag p-0">{page.eyebrow}</span> : null}
            <h2>{page.title}</h2>{page.intro ? <p>{page.intro}</p> : null}{page.body ? <p style={{ whiteSpace: "pre-line" }}>{page.body}</p> : null}
            {page.ctaLabel && page.ctaHref ? <div className="cta-buttons justify-content-center mt-4"><GalleryCta label={page.ctaLabel} href={page.ctaHref} /></div> : null}
          </div></div>
          <StoreProjectsGallery entries={entries} />
        </div>
      </section>
    </>
  );
}
