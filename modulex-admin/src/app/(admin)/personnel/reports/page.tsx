import type { Metadata } from "next";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import HrReports from "@/components/hr/HrReports";
import Alert from "@/components/ui/alert/Alert";

export const metadata: Metadata = {
  title: "HR Reports | Modulex Admin",
  description: "Workforce and HR payroll source reporting",
};

export default function HrReportsPage() {
  return (
    <>
      <PageBreadCrumb pageTitle="HR Reports" />
      <div className="mb-6">
        <Alert
          variant="info"
          title="Payroll reporting boundary"
          message="Payroll amounts in Personnel reports are HR calculation/source records. Actual cash paid, partial settlement and remaining obligations are Finance-owned and must be read from Finance settlement reporting."
        />
      </div>
      <HrReports />
    </>
  );
}
