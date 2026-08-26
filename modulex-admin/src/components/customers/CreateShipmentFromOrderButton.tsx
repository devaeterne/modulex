"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

export default function CreateShipmentFromOrderButton() {
  const params = useParams<{ id: string; orderId: string }>();
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function createShipment() {
    if (!params.id || !params.orderId || isCreating) return;
    setIsCreating(true);
    setErrorMessage(null);

    const { data, error } = await supabase.rpc("create_customer_shipment_from_order", {
      p_order_id: params.orderId,
      p_notes: null,
      p_internal_notes: null,
    });

    if (error) {
      setErrorMessage(error.message);
      setIsCreating(false);
      return;
    }

    router.push(`/customers/${params.id}/shipments/${data as string}`);
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button type="button" onClick={createShipment} disabled={isCreating} className="inline-flex h-10 items-center justify-center rounded-lg bg-success-600 px-4 text-sm font-medium text-white shadow-theme-xs hover:bg-success-700 disabled:opacity-60">
        {isCreating ? "Creating Shipment..." : "Create Shipment"}
      </button>
      {errorMessage && <p className="max-w-sm text-right text-xs text-error-600 dark:text-error-400">{errorMessage}</p>}
    </div>
  );
}
