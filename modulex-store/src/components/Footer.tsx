import Image from "next/image";
import Link from "next/link";
import TrackedLink from "@/components/analytics/TrackedLink";
import StoreIcon, { type StoreIconName } from "@/components/StoreIcon";
import type { StorePublicCompanyProfile } from "@/lib/store/company/queries";
import type { ResolvedStoreChromeItem } from "@/lib/store/chrome/destinations";
import type { StoreSiteSettings } from "@/lib/store/site/queries";

function phoneHref(phone: string) {
  return `tel:${phone.replace(/[^+\d]/g, "")}`;
}

function BusinessLink({ item, context }: { item: ResolvedStoreChromeItem; context: string }) {
  if (item.destinationKey === "contact") {
    return (
      <TrackedLink href={item.href} event="contact_click" payload={{ context }}>
        {item.label}
      </TrackedLink>
    );
  }

  return <Link href={item.href}>{item.label}</Link>;
}

export default function Footer({
  company,
  settings,
  productLinks,
  companyLinks,
}: {
  company: StorePublicCompanyProfile | null;
  settings: StoreSiteSettings | null;
  productLinks: ResolvedStoreChromeItem[];
  companyLinks: ResolvedStoreChromeItem[];
}) {
  const companyName = company?.companyName || "Oakwell Cabinetry";
  const addressLine = [company?.addressLine1, company?.addressLine2].filter(Boolean).join(", ");
  const hasUsableLocality = Boolean(company?.city && (company?.stateRegion || company?.postalCode));
  const localityLine = hasUsableLocality
    ? [company?.city, company?.stateRegion, company?.postalCode].filter(Boolean).join(", ")
    : "";
  const socialCandidates: Array<[string, string | null | undefined, StoreIconName]> = [
    ["Facebook", settings?.facebookUrl, "facebook"],
    ["Instagram", settings?.instagramUrl, "instagram"],
    ["LinkedIn", settings?.linkedinUrl, "linkedin"],
    ["Pinterest", settings?.pinterestUrl, "pinterest"],
    ["TikTok", settings?.tiktokUrl, "tiktok"],
    ["YouTube", settings?.youtubeUrl, "youtube"],
  ];
  const socials = socialCandidates.filter((item): item is [string, string, StoreIconName] => Boolean(item[1]));

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
                  <StoreIcon name={icon} />
                </a>
              ))}
            </div>
          ) : null}
        </div>

        <div className="footer-links">
          <h3>Products</h3>
          <ul>
            {productLinks.map((item) => (
              <li key={item.id}>
                <BusinessLink item={item} context="footer_product_support" />
              </li>
            ))}
          </ul>
        </div>

        <div className="footer-links">
          <h3>Company</h3>
          <ul>
            {companyLinks.map((item) => (
              <li key={item.id}>
                <BusinessLink item={item} context="footer_company" />
              </li>
            ))}
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
