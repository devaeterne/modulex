"use client";

import { useParams } from "next/navigation";
import EntityDocumentsPanel from "@/components/customers/EntityDocumentsPanel";

export default function OrderDocumentsPanel() {
  const params = useParams<{ orderId: string }>();
  return (
    <div className="mt-5">
      <EntityDocumentsPanel
        entityType="order"
        entityId={params.orderId}
        title="Documents & Photos"
      />
    </div>
  );
}
