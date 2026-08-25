import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import ScanPanel from "@/components/scan/ScanPanel";

export const metadata: Metadata = {
  title: "Scan QR / Barcode | Modulex Admin",
  description: "Scan Modulex shelf QR labels and product barcodes",
};

export default function ScanPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Scan QR / Barcode" />
      <ScanPanel />
    </div>
  );
}