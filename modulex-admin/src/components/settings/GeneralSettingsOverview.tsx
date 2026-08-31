import Link from "next/link";
import ComponentCard from "@/components/common/ComponentCard";

const sections = [
  { title: "Company", description: "Company identity, logo, legal details, contact information and address.", href: "/settings/general/company", icon: "CO" },
  { title: "Localization", description: "Default currency, locale and timezone used across the application.", href: "/settings/general/localization", icon: "LO" },
  { title: "Documents", description: "Order and invoice document titles, footer notes and customer-facing wording.", href: "/settings/general/documents", icon: "DO" },
  { title: "Tax Rules", description: "Expected tax rates for Customer Pickup, Delivery and Delivery + Installation workflows.", href: "/settings/general/tax-rules", icon: "TX" },
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
        desc="Settings are grouped by purpose so company data, documents, tax rules, email and operational notifications can be managed without searching through one long page."
      >
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Choose a settings area below to review or update its configuration.
        </p>
      </ComponentCard>

      <nav aria-label="General settings sections" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sections.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            aria-label={`${section.title}: ${section.description}`}
            className="group rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-theme-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-brand-800"
          >
            <div className="flex items-start gap-4">
              <span
                aria-hidden="true"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-xs font-semibold text-brand-600 dark:bg-brand-500/10 dark:text-brand-400"
              >
                {section.icon}
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold text-gray-800 dark:text-white/90">{section.title}</h2>
                  <span
                    aria-hidden="true"
                    className="text-gray-300 transition group-hover:translate-x-0.5 group-hover:text-brand-500 dark:text-gray-600"
                  >
                    →
                  </span>
                </div>
                <p className="mt-1.5 text-sm leading-6 text-gray-500 dark:text-gray-400">
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
