"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

export default function CreateInvoiceFromOrderButton() {
  const params = useParams<{ id: string; orderId: string }>();
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function createInvoice() {
    if (!params.orderId || !params.id || isCreating) return;
    setIsCreating(true);
    setErrorMessage(null);

    const { data, error } = await supabase.rpc("create_customer_invoice_from_order", {
      p_order_id: params.orderId,
      p_due_date: null,
      p_notes: null,
      p_internal_notes: null,
      p_issue_now: false,
    });

    if (error) {
      setErrorMessage(error.message);
      setIsCreating(false);
      return;
    }

    const invoiceId = data as string;
    router.push(`/customers/${params.id}/invoices/${invoiceId}`);
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={createInvoice}
        disabled={isCreating}
        className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white shadow-theme-xs transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isCreating ? "Creating Invoice..." : "Create Invoice"}
      </button>
      {errorMessage && <p className="max-w-sm text-right text-xs text-error-600 dark:text-error-400">{errorMessage}</p>}
    </div>
  );
}
