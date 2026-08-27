import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import PersonnelOverview from "@/components/hr/PersonnelOverview";

export const metadata: Metadata = {
  title: "Personnel | Modulex Admin",
  description: "Personnel and employee master data",
};

export default function PersonnelPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Personnel" />
      <PersonnelOverview />
    </div>
  );
}
