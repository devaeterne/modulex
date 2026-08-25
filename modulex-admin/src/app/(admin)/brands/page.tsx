import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import BrandsTable from "@/components/brands/BrandsTable";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Brands | Modulex Admin",
  description: "Manage product brands in Modulex Admin",
};

export default function BrandsPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Brands" />
      <BrandsTable />
    </div>
  );
}