import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import TaxRulesSettings from "@/components/settings/TaxRulesSettings";

export const metadata: Metadata = {
  title: "Tax Rules | Modulex Admin",
  description: "Configure fulfillment-specific tax rules",
};

export default function TaxRulesPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Tax Rules" />
      <TaxRulesSettings />
    </div>
  );
}
