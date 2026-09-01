import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import AddCountertopToOrder from "@/components/customers/AddCountertopToOrder";
import EditCustomerOrder from "@/components/customers/EditCustomerOrder";

export const metadata: Metadata = {
  title: "Edit Order | Modulex Admin",
  description: "Revise an existing customer order without recreating it",
};

export default function EditCustomerOrderPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-6 lg:px-8">
      <PageBreadcrumb pageTitle="Edit Order" />
      <AddCountertopToOrder />
      <EditCustomerOrder />
    </div>
  );
}
