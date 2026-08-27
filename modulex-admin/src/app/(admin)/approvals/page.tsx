import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import ApprovalRequestsManager from "@/components/approvals/ApprovalRequestsManager";

export const metadata: Metadata = {
  title: "Approvals | Modulex Admin",
  description: "Review protected sales, order, customer and invoice changes",
};

export default function ApprovalsPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Approvals" />
      <ApprovalRequestsManager />
    </div>
  );
}
