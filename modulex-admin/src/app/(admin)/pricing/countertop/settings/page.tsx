import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import CountertopReferenceManager from "@/components/countertop/CountertopReferenceManager";
import Button from "@/components/ui/button/Button";

export const metadata: Metadata = { title: "Countertop Setup | Modulex Admin" };

export default function CountertopReferenceSettingsPage() {
  return (
    <div className="space-y-6">
      <PageBreadcrumb pageTitle="Countertop Setup" />
      <div className="flex justify-end">
        <form action="/pricing/countertop/services" method="get">
          <Button type="submit">Manage Additional Services</Button>
        </form>
      </div>
      <CountertopReferenceManager kinds={["stone_type", "material_band", "edge"]} />
    </div>
  );
}
