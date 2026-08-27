"use client";

import { useEffect, useState } from "react";
import CostMarginServerTable from "@/components/pricing/CostMarginServerTable";
import CostMarginReadOnlyTable from "@/components/pricing/CostMarginReadOnlyTable";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { hasPermission } from "@/lib/auth/permissions";

export default function CostMarginAccessView() {
  const [mode, setMode] = useState<"loading" | "manage" | "readonly" | "denied">("loading");

  useEffect(() => {
    let mounted = true;
    async function load() {
      const { profile } = await getCurrentProfile();
      if (!mounted) return;
      if (!profile || !hasPermission(profile.role, "pricing.cost.view")) {
        setMode("denied");
        return;
      }
      setMode(hasPermission(profile.role, "pricing.manage") ? "manage" : "readonly");
    }
    void load();
    return () => { mounted = false; };
  }, []);

  if (mode === "loading") {
    return <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500 dark:border-gray-800 dark:bg-white/[0.03]">Loading cost & margin...</div>;
  }
  if (mode === "denied") {
    return <div className="rounded-2xl border border-error-200 bg-error-50 p-6 text-sm text-error-700">You do not have permission to view cost and margin data.</div>;
  }
  return mode === "manage" ? <CostMarginServerTable /> : <CostMarginReadOnlyTable />;
}
