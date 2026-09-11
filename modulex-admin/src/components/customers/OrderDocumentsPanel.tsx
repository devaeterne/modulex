"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import EntityDocumentsPanel from "@/components/customers/EntityDocumentsPanel";
import Alert from "@/components/ui/alert/Alert";
import FormHint from "@/components/form/FormHint";
import { supabase } from "@/lib/supabase/client";

export default function OrderDocumentsPanel() {
  const params = useParams<{ id: string; orderId: string }>();
  const [canonicalOrderId, setCanonicalOrderId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function resolveOrder() {
      setLoading(true);
      setError(null);
      const { data, error: orderError } = await supabase
        .from("customer_orders")
        .select("id")
        .eq("id", params.orderId)
        .eq("customer_id", params.id)
        .maybeSingle();

      if (!active) return;
      if (orderError || !data?.id) {
        setCanonicalOrderId(null);
        setError(orderError?.message || "Order document scope could not be verified.");
      } else {
        setCanonicalOrderId(String(data.id));
      }
      setLoading(false);
    }

    void resolveOrder();
    return () => {
      active = false;
    };
  }, [params.id, params.orderId]);

  if (loading) return <div className="mt-5"><FormHint>Verifying Order document scope…</FormHint></div>;
  if (!canonicalOrderId) {
    return (
      <div className="mt-5">
        <Alert variant="error" title="Order documents unavailable" message={error || "Order document scope could not be verified."} />
      </div>
    );
  }

  return (
    <div className="mt-5">
      <EntityDocumentsPanel
        entityType="order"
        entityId={canonicalOrderId}
        title="Documents & Photos"
      />
    </div>
  );
}
