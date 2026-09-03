"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Button from "@/components/ui/button/Button";
import { supabase } from "@/lib/supabase/client";

export default function CustomerOrderProjectLink() {
  const params = useParams<{ id: string; orderId: string }>();
  const router = useRouter();
  const [projectId, setProjectId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadProjectId() {
      const { data, error } = await supabase
        .from("customer_orders")
        .select("project_id")
        .eq("id", params.orderId)
        .eq("customer_id", params.id)
        .maybeSingle();

      if (!active || error) return;
      setProjectId(data?.project_id ?? null);
    }

    void loadProjectId();
    return () => { active = false; };
  }, [params.id, params.orderId]);

  if (!projectId) return null;

  return (
    <Button size="sm" variant="outline" onClick={() => router.push(`/projects/${projectId}`)}>
      Open Project
    </Button>
  );
}
