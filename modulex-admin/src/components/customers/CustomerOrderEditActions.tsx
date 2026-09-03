"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ADMIN_BUTTON_VARIANTS, ADMIN_FOCUS_RING } from "@/components/ui/theme/adminTheme";
import {
  loadCustomerOrderRevisionPolicy,
  type CustomerOrderRevisionPolicy,
} from "@/lib/customers/order-domain";

export default function CustomerOrderEditActions() {
  const params = useParams<{ id: string; orderId: string }>();
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
    <Link
      href={`/customers/${params.id}/orders/${params.orderId}/edit`}
      title={policy.reason}
      className={`inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm font-medium transition ${ADMIN_BUTTON_VARIANTS.outline} ${ADMIN_FOCUS_RING}`}
    >
      Edit Order
    </Link>
  );
}
