"use client";

import { useParams, useRouter } from "next/navigation";
import ComponentCard from "@/components/common/ComponentCard";
import Button from "@/components/ui/button/Button";

export default function CustomerOrderActions() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const customerId = params.id;

  return (
    <div className="mb-5">
      <ComponentCard
        title="Customer Operations"
        desc="Navigate Projects, Orders and fulfillment records or start the primary sales action."
      >
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => router.push(`/customers/${customerId}/projects`)}>Projects</Button>
          <Button variant="outline" onClick={() => router.push(`/customers/${customerId}/orders`)}>Orders</Button>
          <Button variant="outline" onClick={() => router.push(`/customers/${customerId}/shipments`)}>Shipments</Button>
          <Button variant="outline" onClick={() => router.push(`/customers/${customerId}/installations`)}>Installations</Button>
          <Button variant="outline" onClick={() => router.push(`/customers/${customerId}/invoices`)}>Invoices</Button>
          <Button onClick={() => router.push(`/customers/${customerId}/orders/new`)}>New Order</Button>
        </div>
      </ComponentCard>
    </div>
  );
}
