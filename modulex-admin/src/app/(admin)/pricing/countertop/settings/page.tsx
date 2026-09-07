import type { Metadata } from "next";
import Link from "next/link";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import CountertopReferenceManager from "@/components/countertop/CountertopReferenceManager";

export const metadata: Metadata = { title: "Countertop Setup | Modulex Admin" };

export default function CountertopReferenceSettingsPage() {
  return (
    <div className="space-y-6">
      <PageBreadcrumb pageTitle="Countertop Setup" />
      <div className="flex justify-end">
        <Link
          href="/pricing/countertop/services"
          className="inline-flex items-center justify-center rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600"
        >
          Manage Additional Services
        </Link>
      </div>
      <CountertopReferenceManager kinds={["stone_type", "material_band", "edge"]} />
    </div>
  );
}
