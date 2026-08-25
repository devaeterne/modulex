import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import QRLabelsGrid from "@/components/qr-labels/QRLabelsGrid";

export const metadata: Metadata = {
  title: "QR Labels | Modulex Admin",
  description:
    "Print Modulex warehouse zone and location QR labels",
};

export default function QRLabelsPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="QR Labels" />
      <QRLabelsGrid />
    </div>
  );
}