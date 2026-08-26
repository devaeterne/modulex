"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

export default function CustomerOrderActions() {
  const params = useParams<{ id: string }>();
  const customerId = params.id;

  return (
    <div className="mb-5 flex flex-wrap justify-end gap-2">
      <Link href={`/customers/${customerId}/invoices`} className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 shadow-theme-xs transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]">
        Invoices
      </Link>
      <Link href={`/customers/${customerId}/orders`} className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 shadow-theme-xs transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]">
        View Orders
      </Link>
      <Link href={`/customers/${customerId}/orders/new`} className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white shadow-theme-xs transition hover:bg-brand-600">
        New Order
      </Link>
    </div>
  );
}
