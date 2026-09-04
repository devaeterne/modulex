import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import CustomersTable from "@/components/customers/CustomersTable";
import { ADMIN_TEXT_STYLES } from "@/components/ui/theme/adminTheme";

export const metadata: Metadata = {
  title: "Customers | Modulex Admin",
  description: "Manage Modulex customers, pricing assignments and portal access",
};

export default function CustomersPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Customers" />
      <div className={ADMIN_TEXT_STYLES.body}>
        <CustomersTable />
      </div>
    </div>
  );
}
