import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import CustomersTable from "@/components/customers/CustomersTable";

export const metadata: Metadata = {
  title: "Customers | Modulex Admin",
  description: "Manage Modulex customers, pricing assignments and portal access",
};

export default function CustomersPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Customers" />
      <CustomersTable />
    </div>
  );
}
