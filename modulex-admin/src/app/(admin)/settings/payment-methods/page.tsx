import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import PaymentMethodsManager from "@/components/customers/PaymentMethodsManager";

export const metadata: Metadata = {
  title: "Payment Methods | Modulex Admin",
  description: "Manage order payment methods and commissions",
};

export default function PaymentMethodsSettingsPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Payment Methods" />
      <PaymentMethodsManager />
    </div>
  );
}
