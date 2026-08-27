import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import PositionsManager from "@/components/hr/PositionsManager";

export const metadata: Metadata = {
  title: "Positions | Modulex Admin",
  description: "Manage HR job positions",
};

export default function PositionsPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Positions" />
      <PositionsManager />
    </div>
  );
}
