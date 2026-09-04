import type { Metadata } from "next";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import LeaveManager from "@/components/hr/LeaveManager";

export const metadata: Metadata = {
  title: "Leave & PTO | Modulex Admin",
  description: "Personnel leave, PTO balances and approvals",
};

export default function LeavePage() {
  return (
    <div>
      <PageBreadCrumb pageTitle="Leave & PTO" />
      <LeaveManager />
    </div>
  );
}
