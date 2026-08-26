import type { Metadata } from "next";
import CustomerOrderPrint from "@/components/customers/CustomerOrderPrint";

export const metadata: Metadata = {
  title: "Print Order | Modulex Admin",
  description: "Printable customer sales order",
};

export default function CustomerOrderPrintPage() {
  return <CustomerOrderPrint />;
}
