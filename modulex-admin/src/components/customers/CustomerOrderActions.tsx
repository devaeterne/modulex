"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

const secondaryClass = "inline-flex h-9 items-center justify-center rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 shadow-theme-xs transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]";
const primaryClass = "inline-flex h-9 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white shadow-theme-xs transition hover:bg-brand-600";

export default function CustomerOrderActions() {
  const params = useParams<{ id: string }>();
  const customerId = params.id;

  return (
    <section className="mb-5 rounded-2xl border border-gray-200 bg-white p-4 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Customer operations</p>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Navigate operational records or start the primary sales action.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/customers/${customerId}/orders`} className={secondaryClass}>Orders</Link>
          <Link href={`/customers/${customerId}/shipments`} className={secondaryClass}>Shipments</Link>
          <Link href={`/customers/${customerId}/installations`} className={secondaryClass}>Installations</Link>
          <Link href={`/customers/${customerId}/invoices`} className={secondaryClass}>Invoices</Link>
          <Link href={`/customers/${customerId}/orders/new`} className={primaryClass}>New Order</Link>
        </div>
      </div>
    </section>
  );
}
