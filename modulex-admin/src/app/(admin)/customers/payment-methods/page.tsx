import { redirect } from "next/navigation";

export default function LegacyPaymentMethodsPage() {
  redirect("/settings/payment-methods");
}
