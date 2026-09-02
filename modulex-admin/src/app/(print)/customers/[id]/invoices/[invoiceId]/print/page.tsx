import type { Metadata } from "next";
import CustomerInvoicePrint from "@/components/customers/CustomerInvoicePrint";

export const metadata: Metadata = {
  title: "Print Invoice | Modulex Admin",
  description: "Printable customer invoice",
};

export default function CustomerInvoicePrintPage() {
  return <CustomerInvoicePrint />;
}
