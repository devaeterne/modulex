import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import UsersTable from "@/components/users/UsersTable";

export const metadata: Metadata = {
  title: "User Management | Modulex Admin",
  description: "Manage Modulex users, roles and account security",
};

export default function UsersPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="User Management" />
      <UsersTable />
    </div>
  );
}
