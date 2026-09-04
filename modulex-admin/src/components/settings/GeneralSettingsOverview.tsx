import Link from "next/link";
import ComponentCard from "@/components/common/ComponentCard";
import {
  ADMIN_FOCUS_RING,
  ADMIN_SURFACE_CARD,
  ADMIN_TEXT_STYLES,
} from "@/components/ui/theme/adminTheme";

const sections = [
  { title: "Company", description: "Company identity, logo, legal details, contact information and address.", href: "/settings/general/company", icon: "CO" },
  { title: "Localization", description: "Default currency, locale and timezone used across the application.", href: "/settings/general/localization", icon: "LO" },
  { title: "Documents", description: "Order and invoice document titles, footer notes and customer-facing wording.", href: "/settings/general/documents", icon: "DO" },
  { title: "Tax Rules", description: "Expected tax rates for Customer Pickup, Delivery and Delivery + Installation workflows.", href: "/settings/general/tax-rules", icon: "TX" },
  { title: "Project Participant Roles", description: "Configure reusable Project roles such as Designer, Contractor, Installer and Referral Partner.", href: "/settings/general/project-participant-roles", icon: "PR" },
  { title: "Email", description: "Sender identity, reply-to address, internal recipients and email delivery switches.", href: "/settings/general/email", icon: "EM" },
  { title: "Notifications", description: "Choose whether each operational event uses email, panel notification and sound.", href: "/settings/general/notifications", icon: "NT" },
  { title: "Email Delivery Log", description: "Review pending, sent, failed and skipped transactional emails and retry failures.", href: "/settings/general/email-notifications", icon: "LG" },
  { title: "Payment Methods", description: "Manage company payment methods used by customer and invoice workflows.", href: "/settings/payment-methods", icon: "PM" },
] as const;

export default function GeneralSettingsOverview() {
  return (
    <div className="space-y-5">
      <ComponentCard
        title="General Settings"
        desc="Settings are grouped by purpose so company data, documents, tax rules, Project configuration, email and operational notifications can be managed without searching through one long page."
      >
        <p className={`text-sm ${ADMIN_TEXT_STYLES.muted}`}>
          Choose a settings area below to review or update its configuration.
        </p>
      </ComponentCard>

      <nav aria-label="General settings sections" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sections.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            aria-label={`${section.title}: ${section.description}`}
            className={`${ADMIN_SURFACE_CARD} ${ADMIN_FOCUS_RING} group p-5 transition hover:-translate-y-0.5`}
          >
            <div className="flex items-start gap-4">
              <span
                aria-hidden="true"
                className="flex h-11 w-11 shrink-0 items-center justify-center text-xs font-semibold"
              >
                {section.icon}
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className={`font-semibold ${ADMIN_TEXT_STYLES.strong}`}>{section.title}</h2>
                  <span aria-hidden="true" className="transition group-hover:translate-x-0.5">
                    →
                  </span>
                </div>
                <p className={`mt-1.5 text-sm leading-6 ${ADMIN_TEXT_STYLES.muted}`}>
                  {section.description}
                </p>
              </div>
            </div>
          </Link>
        ))}
      </nav>
    </div>
  );
}
