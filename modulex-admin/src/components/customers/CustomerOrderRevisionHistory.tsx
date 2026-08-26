"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import type { CustomerOrderRevision } from "@/lib/customers/types";

function dateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function CustomerOrderRevisionHistory() {
  const params = useParams<{ orderId: string }>();
  const [revisions, setRevisions] = useState<CustomerOrderRevision[]>([]);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("customer_order_revisions")
        .select("*")
        .eq("order_id", params.orderId)
        .order("revision_number", { ascending: false });
      setRevisions((data ?? []) as CustomerOrderRevision[]);
    }
    load();
  }, [params.orderId]);

  if (revisions.length === 0) return null;

  return (
    <div className="mt-5 rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900">
      <div>
        <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Order Revisions</h2>
        <p className="mt-1 text-sm text-gray-500">Previous order versions are preserved automatically.</p>
      </div>
      <div className="mt-4 space-y-3">
        {revisions.map((revision) => (
          <div key={revision.id} className="flex flex-col gap-1 rounded-xl border border-gray-200 p-3 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-gray-800 dark:text-white/90">Revision {revision.revision_number}</p>
              <p className="mt-0.5 text-xs text-gray-500">{revision.reason || "No revision reason provided"}</p>
            </div>
            <p className="text-xs text-gray-400">{dateTime(revision.created_at)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
