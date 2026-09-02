import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import PermissionVisible from "@/components/auth/PermissionVisible";
import CustomerOrderDetail from "@/components/customers/CustomerOrderDetail";
import CustomerOrderEditActions from "@/components/customers/CustomerOrderEditActions";
import CustomerOrderRevisionHistory from "@/components/customers/CustomerOrderRevisionHistory";
import CustomerOrderProjectLink from "@/components/customers/CustomerOrderProjectLink";
import CreateInvoiceFromOrderButton from "@/components/customers/CreateInvoiceFromOrderButton";
import CreateShipmentFromOrderButton from "@/components/customers/CreateShipmentFromOrderButton";
import CreateInstallationFromOrder from "@/components/customers/CreateInstallationFromOrder";

export const metadata: Metadata = {
  title: "Order Detail | Modulex Admin",
  description: "Customer order detail, status and revision history",
};

export default function CustomerOrderDetailPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Order Detail" />
      <div className="mb-5 flex flex-wrap justify-end gap-2">
        <PermissionVisible permission="projects.view">
          <CustomerOrderProjectLink />
        </PermissionVisible>
        <PermissionVisible permission="shipments.manage">
          <CreateShipmentFromOrderButton />
        </PermissionVisible>
        <PermissionVisible permission="invoices.manage">
          <CreateInvoiceFromOrderButton />
        </PermissionVisible>
      </div>
      <PermissionVisible permission="installations.manage">
        <CreateInstallationFromOrder />
      </PermissionVisible>
      <PermissionVisible permission="orders.manage">
        <CustomerOrderEditActions />
      </PermissionVisible>
      <CustomerOrderDetail />
      <CustomerOrderRevisionHistory />
    </div>
  );
}
