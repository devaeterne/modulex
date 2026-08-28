import Image from "next/image";
import Link from "next/link";
import TrackedLink from "@/components/analytics/TrackedLink";
import { getStorePublicCompanyProfile } from "@/lib/store/company/queries";
import { getStoreSiteSettings } from "@/lib/store/site/queries";

function phoneHref(phone: string) {
  return `tel:${phone.replace(/[^+\d]/g, "")}`;
}

export default async function Footer() {
  const [companyResult, settingsResult] = await Promise.allSettled([
    getStorePublicCompanyProfile(),
    getStoreSiteSettings(),
  ]);
  const company = companyResult.status === "fulfilled" ? companyResult.value : null;
  const settings = settingsResult.status === "fulfilled" ? settingsResult.value : null;
  const companyName = company?.companyName || "Oakwell Cabinetry";
  const addressLine = [company?.addressLine1, company?.addressLine2].filter(Boolean).join(", ");
  const hasUsableLocality = Boolean(company?.city && (company?.stateRegion || company?.postalCode));
  const localityLine = hasUsableLocality
    ? [company?.city, company?.stateRegion, company?.postalCode].filter(Boolean).join(", ")
    : "";
  const socials = [
    ["Facebook", settings?.facebookUrl, "bi-facebook"],
    ["Instagram", settings?.instagramUrl, "bi-instagram"],
    ["LinkedIn", settings?.linkedinUrl, "bi-linkedin"],
    ["Pinterest", settings?.pinterestUrl, "bi-pinterest"],
    ["TikTok", settings?.tiktokUrl, "bi-tiktok"],
    ["YouTube", settings?.youtubeUrl, "bi-youtube"],
  ].filter((item): item is [string, string, string] => Boolean(item[1]));

  return (
    <footer>
      <div className="footer-content">
        <div className="footer-brand">
          <div className="logo mb-3">
            {company?.logoUrl ? (
              <Image src={company.logoUrl} width={180} height={64} className="h-100 w-auto object-contain" alt={companyName} />
            ) : (
              <Image src="/assets/images/logo-white.png" width={180} height={64} className="h-100 w-auto object-contain" alt={companyName} />
            )}
          </div>
          {settings?.footerDescription ? <p>{settings.footerDescription}</p> : null}

          {socials.length > 0 ? (
            <div className="social-links">
              {socials.map(([label, href, icon]) => (
                <a key={label} href={href} target="_blank" rel="noopener noreferrer" aria-label={label}>
                  <i className={`bi ${icon}`} aria-hidden="true"></i>
                </a>
              ))}
            </div>
          ) : null}
        </div>

        <div className="footer-links">
          <h3>Products</h3>
          <ul>
            <li><Link href="/products">Product Catalog</Link></li>
            <li><Link href="/gallery">Projects & Inspiration</Link></li>
            <li>
              <TrackedLink href="/contact" event="contact_click" payload={{ context: "footer_product_support" }}>
                Product Support
              </TrackedLink>
            </li>
          </ul>
        </div>

        <div className="footer-links">
          <h3>Company</h3>
          <ul>
            <li><Link href="/about">About Us</Link></li>
            <li><Link href="/gallery">Gallery</Link></li>
            <li>
              <TrackedLink href="/contact" event="contact_click" payload={{ context: "footer_company" }}>
                Contact
              </TrackedLink>
            </li>
          </ul>
        </div>

        <div className="footer-links">
          <h3>Contact</h3>
          <ul>
            {company?.email ? (
              <li>
                <TrackedLink href={`mailto:${company.email}`} event="email_click" payload={{ context: "footer" }}>
                  {company.email}
                </TrackedLink>
              </li>
            ) : null}
            {company?.phone ? (
              <li>
                <TrackedLink href={phoneHref(company.phone)} event="phone_click" payload={{ context: "footer" }}>
                  {company.phone}
                </TrackedLink>
              </li>
            ) : null}
            {addressLine ? <li><span>{addressLine}</span></li> : null}
            {localityLine ? <li><span>{localityLine}</span></li> : null}
            {company?.website ? <li><a href={company.website} target="_blank" rel="noopener noreferrer">Website</a></li> : null}
            {!company?.email && !company?.phone && !addressLine && !localityLine ? (
              <li>
                <TrackedLink href="/contact" event="contact_click" payload={{ context: "footer_fallback" }}>
                  Contact Oakwell Cabinetry
                </TrackedLink>
              </li>
            ) : null}
          </ul>
        </div>
      </div>

      <div className="footer-bottom">
        <p>
          &copy; {new Date().getFullYear()} {companyName}. All rights reserved. Developed by{" "}
          <a href="https://www.dasoft.me/" target="_blank" rel="noopener noreferrer">Da Software</a>
        </p>
      </div>
    </footer>
  );
}
