import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import EditCustomerOrder from "@/components/customers/EditCustomerOrder";

export const metadata: Metadata = {
  title: "Edit Order | Modulex Admin",
  description: "Revise an existing customer order without recreating it",
};

export default function EditCustomerOrderPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Edit Order" />
      <EditCustomerOrder />
    </div>
  );
}
