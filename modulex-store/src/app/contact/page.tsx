import type { Metadata } from "next";
import Link from "next/link";
import TrackedLink from "@/components/analytics/TrackedLink";
import LeadForm from "@/components/leads/LeadForm";
import {
  getStorePublicCompanyLocations,
  getStorePublicCompanyProfile,
  type StorePublicCompanyContactChannel,
  type StorePublicCompanyLocation,
} from "@/lib/store/company/queries";

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

function safeContactHref(href: string | null) {
  const value = href?.trim();
  if (!value) return null;
  return /^(?:https?:\/\/|mailto:|tel:)/i.test(value) ? value : null;
}

function locationAddressLines(location: StorePublicCompanyLocation) {
  return [
    location.addressLine1,
    location.addressLine2,
    [location.city, location.stateRegion, location.postalCode].filter(Boolean).join(", "),
    location.countryCode,
  ].filter((line): line is string => Boolean(line));
}

function StructuredContactCard({ channel }: { channel: StorePublicCompanyContactChannel }) {
  const href = safeContactHref(channel.href);
  const content = href ? <a href={href}>{channel.value}</a> : channel.value;
  return <div className="col-lg-4 col-md-6"><div className="service-card h-100"><div className="service-icon" aria-hidden="true"><i className="bi bi-chat-square-text"></i></div><h3>{channel.label}</h3><p>{content}</p></div></div>;
}

function LocationCard({ location }: { location: StorePublicCompanyLocation }) {
  const addressLines = locationAddressLines(location);
  const mapHref = /^https?:\/\//i.test(location.mapUrl?.trim() ?? "") ? location.mapUrl!.trim() : null;
  return <div className="col-lg-4 col-md-6"><div className="service-card h-100"><div className="service-icon" aria-hidden="true"><i className="bi bi-geo-alt"></i></div><h3>{location.name}</h3>{addressLines.length > 0 ? <address>{addressLines.map((line) => <span className="d-block" key={line}>{line}</span>)}</address> : null}{location.email ? <p className="mb-1"><a href={`mailto:${location.email}`}>{location.email}</a></p> : null}{location.phone ? <p className="mb-1"><a href={phoneHref(location.phone)}>{location.phone}</a></p> : null}{mapHref ? <p className="mb-0"><a href={mapHref} target="_blank" rel="noopener noreferrer">View map</a></p> : null}</div></div>;
}

export default async function Contact() {
  const [companyResult, structureResult] = await Promise.allSettled([
    getStorePublicCompanyProfile(),
    getStorePublicCompanyLocations(),
  ]);

  const company = companyResult.status === "fulfilled" ? companyResult.value : null;
  const structure = structureResult.status === "fulfilled" ? structureResult.value : { contactChannels: [], locations: [] };

  if (companyResult.status === "rejected") console.error("Unable to load public company contact details", companyResult.reason);
  if (structureResult.status === "rejected") console.error("Unable to load public structured company details", structureResult.reason);

  const companyName = company?.companyName || "Oakwell Cabinetry";
  const hasUsableLocality = Boolean(company?.city && (company?.stateRegion || company?.postalCode));
  const addressLines = [
    company?.addressLine1,
    company?.addressLine2,
    hasUsableLocality ? [company?.city, company?.stateRegion, company?.postalCode].filter(Boolean).join(", ") : null,
  ].filter(Boolean) as string[];
  const hasDirectContact = Boolean(
    company?.email ||
    company?.phone ||
    addressLines.length > 0 ||
    structure.contactChannels.length > 0 ||
    structure.locations.length > 0
  );

  return (
    <>
      <section className="page-header">
        <div className="header-bg-image" style={{ backgroundImage: "url('/assets/images/img(1).jpg')" }} />
        <div className="header-overlay" />
        <div className="container"><div className="row"><div className="header-content"><div className="bread-title"><h1>Contact</h1></div><nav className="breadcrumb" aria-label="Breadcrumb"><Link href="/">Home</Link><span className="separator">/</span><span className="current">Contact</span></nav></div></div></div>
      </section>

      <section className="contact-section" id="contact" aria-labelledby="contact-heading">
        <div className="container">
          <div className="section-header text-center"><span className="section-tag">{companyName}</span><h2 id="contact-heading">Get in Touch</h2><p>Contact our team for product information, cabinet specifications, dealer support, and general inquiries.</p></div>

          <div className="row g-4 justify-content-center">
            {company?.email ? <div className="col-lg-4 col-md-6"><div className="service-card h-100"><div className="service-icon" aria-hidden="true"><i className="bi bi-envelope"></i></div><h3>Email</h3><p><TrackedLink href={`mailto:${company.email}`} event="email_click" payload={{ context: "contact_page" }}>{company.email}</TrackedLink></p></div></div> : null}
            {company?.phone ? <div className="col-lg-4 col-md-6"><div className="service-card h-100"><div className="service-icon" aria-hidden="true"><i className="bi bi-telephone"></i></div><h3>Phone</h3><p><TrackedLink href={phoneHref(company.phone)} event="phone_click" payload={{ context: "contact_page" }}>{company.phone}</TrackedLink></p></div></div> : null}
            {addressLines.length > 0 ? <div className="col-lg-4 col-md-6"><div className="service-card h-100"><div className="service-icon" aria-hidden="true"><i className="bi bi-geo-alt"></i></div><h3>Company Address</h3><p>{addressLines.map((line, index) => <span key={`${line}-${index}`}>{line}{index < addressLines.length - 1 ? <br /> : null}</span>)}</p></div></div> : null}
            {structure.contactChannels.map((channel) => <StructuredContactCard key={channel.id} channel={channel} />)}
          </div>

          {structure.locations.length > 0 ? <div className="mt-5"><div className="section-header text-center"><span className="section-tag">Locations</span><h2>Published company locations</h2></div><div className="row g-4 justify-content-center">{structure.locations.map((location) => <LocationCard key={location.id} location={location} />)}</div></div> : null}

          {!hasDirectContact ? <div className="py-4 text-center"><p className="text-muted mb-0">Official direct contact details are being updated. You can still send an inquiry below.</p></div> : null}

          <div className="row justify-content-center mt-5"><div className="col-xl-9 col-lg-10"><div className="contact-form-wrapper"><div className="mb-4"><h3>Send an Inquiry</h3><p className="text-muted mb-0">Use this form for product questions, specifications, availability information, or general support.</p></div><LeadForm type="contact" /></div></div></div>

          <div className="mt-5 text-center"><p className="text-muted mb-3">Interested in representing Oakwell Cabinetry?</p><Link href="/dealers/apply" className="btn-primary">Apply to Become a Dealer</Link></div>
        </div>
      </section>
    </>
  );
}
