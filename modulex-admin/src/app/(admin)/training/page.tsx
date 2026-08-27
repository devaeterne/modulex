import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import TrainingCenter from "@/components/training/TrainingCenter";

export const metadata: Metadata = {
  title: "Help & Training | Oakwell Cabinetry Admin",
  description: "Role-based training and operating guides for Oakwell Cabinetry Admin",
};

export default function TrainingPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Help & Training" />
      <TrainingCenter />
    </div>
  );
}
