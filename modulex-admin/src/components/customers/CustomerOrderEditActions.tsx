"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
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
    <div className="mb-4 flex justify-end">
      <Link
        href={`/customers/${params.id}/orders/${params.orderId}/edit`}
        title={policy.reason}
        className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 shadow-theme-xs transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]"
      >
        Edit Order
      </Link>
    </div>
  );
}
