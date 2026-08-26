import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import OrderDocumentSettings from "@/components/settings/OrderDocumentSettings";
import InvoiceDocumentSettings from "@/components/settings/InvoiceDocumentSettings";

export const metadata: Metadata = { title: "Document Settings | Modulex Admin", description: "Manage order and invoice document defaults" };

export default function DocumentSettingsPage() {
  return <div><PageBreadcrumb pageTitle="Document Settings" /><div className="space-y-5"><OrderDocumentSettings /><InvoiceDocumentSettings /></div></div>;
}
