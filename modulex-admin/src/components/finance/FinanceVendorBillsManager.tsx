"use client";

import { useEffect, useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import Alert from "@/components/ui/alert/Alert";
import Button from "@/components/ui/button/Button";
import { hasPermission } from "@/lib/auth/permissions";
import { getCurrentProfile } from "@/lib/supabase/profile";
import VendorCommitmentsPanel from "@/components/finance/vendor-payables/VendorCommitmentsPanel";
import VendorBillsPanel from "@/components/finance/vendor-payables/VendorBillsPanel";
import FinancePaymentScheduleManager from "@/components/finance/FinancePaymentScheduleManager";

type PayablesTab = "commitments" | "bills" | "schedule";

const tabs: Array<{ id: PayablesTab; label: string }> = [
  { id: "commitments", label: "Commitments" },
  { id: "bills", label: "Vendor Bills" },
  { id: "schedule", label: "Payment Schedule" },
];

function readInitialQuery() {
  if (typeof window === "undefined") return { tab: "commitments" as PayablesTab, vendor: "", order: "" };
  const params = new URLSearchParams(window.location.search);
  const requested = params.get("tab");
  return {
    tab: (requested === "bills" || requested === "schedule" || requested === "commitments" ? requested : "commitments") as PayablesTab,
    vendor: params.get("vendor") ?? "",
    order: params.get("order") ?? "",
  };
}

export default function FinanceVendorBillsManager() {
  const [tab, setTab] = useState<PayablesTab>("commitments");
  const [vendorId, setVendorId] = useState("");
  const [orderId, setOrderId] = useState("");
  const [canManage, setCanManage] = useState(false);
  const [loadingAccess, setLoadingAccess] = useState(true);
  const [accessError, setAccessError] = useState<string | null>(null);

  useEffect(() => {
    const initial = readInitialQuery();
    setTab(initial.tab);
    setVendorId(initial.vendor);
    setOrderId(initial.order);
    void getCurrentProfile()
      .then((result) => setCanManage(hasPermission(result.profile?.roles, "finance.manage")))
      .catch((error) => setAccessError(error instanceof Error ? error.message : "Finance access could not be resolved."))
      .finally(() => setLoadingAccess(false));
  }, []);

  function navigate(nextTab: PayablesTab, nextVendor = vendorId, nextOrder = orderId) {
    setTab(nextTab);
    setVendorId(nextVendor);
    setOrderId(nextOrder);
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    params.set("tab", nextTab);
    if (nextVendor) params.set("vendor", nextVendor); else params.delete("vendor");
    if (nextOrder) params.set("order", nextOrder); else params.delete("order");
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
  }

  return (
    <div className="space-y-5">
      {accessError ? <Alert variant="error" title="Vendor Payables" message={accessError} /> : null}
      {!loadingAccess && !canManage ? <Alert variant="info" title="Read-only Finance access" message="You can review Vendor commitments, Vendor Bills, real payment settlement and Payment Schedule, but Finance mutations require finance.manage." /> : null}
      <ComponentCard title="Vendor Payables" desc="Commitments come from Vendor Cabinet Orders. Vendor Bills remain AP documents, Payment Schedule remains Bill-based, and posted Vendor Payments remain the only settlement source.">
        <div className="mb-5 flex flex-wrap gap-2 border-b border-gray-200 pb-4 dark:border-gray-800">
          {tabs.map((item) => <Button key={item.id} size="sm" variant={tab === item.id ? "primary" : "ghost"} onClick={() => navigate(item.id)}>{item.label}</Button>)}
        </div>
        {tab === "commitments" ? <VendorCommitmentsPanel initialVendorId={vendorId} initialOrderId={orderId} onOpenBills={(vendor, order) => navigate("bills", vendor, order)} /> : null}
        {tab === "bills" ? <VendorBillsPanel canManage={canManage} initialVendorId={vendorId} initialOrderId={orderId} /> : null}
        {tab === "schedule" ? <FinancePaymentScheduleManager /> : null}
      </ComponentCard>
    </div>
  );
}
