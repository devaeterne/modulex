import type { Metadata } from "next";
import Link from "next/link";
import { getStorePublicCompanyLocations, type StorePublicCompanyLocation } from "@/lib/store/company/queries";

export const revalidate = 900;

export const metadata: Metadata = {
  title: "Showroom",
  description: "View published Oakwell Cabinetry showroom locations and verified business hours.",
  alternates: { canonical: "/showroom" },
  openGraph: {
    title: "Showroom | Oakwell Cabinetry",
    description: "View published Oakwell Cabinetry showroom locations and verified business hours.",
    url: "/showroom",
  },
};

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function phoneHref(phone: string) {
  return `tel:${phone.replace(/[^+\d]/g, "")}`;
}

function addressLines(location: StorePublicCompanyLocation) {
  return [
    location.addressLine1,
    location.addressLine2,
    [location.city, location.stateRegion, location.postalCode].filter(Boolean).join(", "),
    location.countryCode,
  ].filter((line): line is string => Boolean(line));
}

function displayTime(value: string | null) {
  return value?.slice(0, 5) ?? "";
}

export default async function ShowroomPage() {
  let locations: StorePublicCompanyLocation[] = [];
  try {
    const structure = await getStorePublicCompanyLocations();
    locations = structure.locations;
  } catch (error) {
    console.error("Unable to load public showroom locations", error);
  }

  const showrooms = locations.filter((location) => location.locationType === "showroom");

  return (
    <>
      <section className="page-header">
        <div className="header-overlay" />
        <div className="container"><div className="row"><div className="header-content"><div className="bread-title"><h1>Showroom</h1></div><nav className="breadcrumb" aria-label="Breadcrumb"><Link href="/">Home</Link><span className="separator">/</span><span className="current">Showroom</span></nav></div></div></div>
      </section>

      <section className="process-section" aria-labelledby="showroom-heading">
        <div className="container py-5">
          <div className="section-header text-center"><span className="section-tag">Oakwell Cabinetry</span><h2 id="showroom-heading">Published showroom locations</h2><p>Only locations explicitly published as showrooms are listed here.</p></div>

          {showrooms.length === 0 ? (
            <div className="row justify-content-center"><div className="col-lg-8"><div className="service-card text-center"><h3>No showroom locations are currently published.</h3><p className="text-muted">Contact our team for current visit and product-support options.</p><Link href="/contact" className="btn-primary">Contact Oakwell Cabinetry</Link></div></div></div>
          ) : (
            <div className="row g-4 justify-content-center">
              {showrooms.map((location) => {
                const lines = addressLines(location);
                const mapHref = /^https?:\/\//i.test(location.mapUrl?.trim() ?? "") ? location.mapUrl!.trim() : null;
                return <div className="col-lg-6" key={location.id}><article className="service-card h-100"><div className="service-icon" aria-hidden="true"><i className="bi bi-building"></i></div><h3>{location.name}</h3>{lines.length > 0 ? <address>{lines.map((line) => <span className="d-block" key={line}>{line}</span>)}</address> : null}{location.email ? <p><strong>Email:</strong> <a href={`mailto:${location.email}`}>{location.email}</a></p> : null}{location.phone ? <p><strong>Phone:</strong> <a href={phoneHref(location.phone)}>{location.phone}</a></p> : null}{mapHref ? <p><a href={mapHref} target="_blank" rel="noopener noreferrer">View map</a></p> : null}{location.hours.length > 0 ? <div className="mt-4"><h4>Business Hours</h4><dl className="mb-0">{location.hours.map((hour) => <div className="d-flex justify-content-between gap-3" key={`${location.id}-${hour.dayOfWeek}`}><dt>{DAYS[hour.dayOfWeek] ?? `Day ${hour.dayOfWeek}`}</dt><dd className="mb-1 text-end">{hour.isClosed ? "Closed" : `${displayTime(hour.opensAt)}–${displayTime(hour.closesAt)}`}{hour.note ? <span className="d-block text-muted">{hour.note}</span> : null}</dd></div>)}</dl></div> : null}</article></div>;
              })}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
