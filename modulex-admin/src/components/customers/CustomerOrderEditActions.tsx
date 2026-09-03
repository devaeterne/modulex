"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Button from "@/components/ui/button/Button";
import {
  loadCustomerOrderRevisionPolicy,
  type CustomerOrderRevisionPolicy,
} from "@/lib/customers/order-domain";

export default function CustomerOrderEditActions() {
  const params = useParams<{ id: string; orderId: string }>();
  const router = useRouter();
  const [policy, setPolicy] = useState<CustomerOrderRevisionPolicy | null>(null);

  useEffect(() => {
    let active = true;

    async function loadPolicy() {
      try {
        const nextPolicy = await loadCustomerOrderRevisionPolicy(params.id, params.orderId);
        if (active) setPolicy(nextPolicy);
      } catch {
        if (active) setPolicy(null);
      }
    }

    void loadPolicy();
    return () => { active = false; };
  }, [params.id, params.orderId]);

  if (!policy?.canEdit) return null;

  return (
    <Button
      variant="outline"
      size="sm"
      title={policy.reason}
      onClick={() => router.push(`/customers/${params.id}/orders/${params.orderId}/edit`)}
    >
      Edit Order
    </Button>
  );
}
