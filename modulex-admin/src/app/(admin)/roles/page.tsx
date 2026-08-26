import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import RolesAccess from "@/components/users/RolesAccess";

export const metadata: Metadata = {
  title: "Roles & Access | Modulex Admin",
  description: "Review Modulex role permissions and access policy",
};

export default function RolesPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Roles & Access" />
      <RolesAccess />
    </div>
  );
}
