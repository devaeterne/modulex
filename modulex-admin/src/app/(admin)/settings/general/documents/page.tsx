import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import DocumentBrandingSettings from "@/components/settings/DocumentBrandingSettings";
import OrderDocumentSettings from "@/components/settings/OrderDocumentSettings";
import InvoiceDocumentSettings from "@/components/settings/InvoiceDocumentSettings";

export const metadata: Metadata = {
  title: "Document Settings | Modulex Admin",
  description: "Manage commercial document branding and order/invoice defaults",
};

export default function DocumentSettingsPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Document Settings" />
      <div className="space-y-5">
        <DocumentBrandingSettings />
        <OrderDocumentSettings />
        <InvoiceDocumentSettings />
      </div>
    </div>
  );
}
