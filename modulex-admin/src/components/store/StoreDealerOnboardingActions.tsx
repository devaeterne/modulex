"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Button from "@/components/ui/button/Button";
import { ADMIN_BRANDING_STYLES, ADMIN_SURFACE_CARD } from "@/components/ui/theme/adminTheme";
import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";
import type { StoreLead } from "@/lib/store/leads";

type DealerReviewResult = {
  ok: boolean;
  reason?: string;
  customer_id?: string;
  customer_code?: string;
  customer_name?: string;
  portal_user_id?: string;
  portal_user_status?: "never_invited" | "invited" | "active" | "suspended";
};

type DealerAccountState = {
  status: "active" | "inactive" | "blocked" | "prospect";
  portal_enabled: boolean;
};

type PortalApiResponse = { error?: string };

const reasonClass = "min-h-20 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-none focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";

function reviewError(result: DealerReviewResult) {
  switch (result.reason) {
    case "existing_customer_not_dealer": return "The matching Customer is not currently a Dealer account. Review that Customer before linking.";
    case "existing_customer_mismatch": return "The selected Customer no longer matches the application email or company.";
    case "existing_customer_inactive": return "The matching Dealer Customer is inactive or blocked. Reactivate/review the Customer before linking.";
    case "dealer_account_inactive": return "This Dealer account is inactive. Use Reactivate Dealer instead of rerunning approval.";
    case "dealer_account_blocked": return "This Dealer account is blocked and cannot be activated from onboarding.";
    case "reason_required": return "A review/lifecycle reason is required.";
    case "not_authorized": return "Dealer lifecycle actions require Admin or Super Admin access.";
    default: return `Dealer workflow failed (${result.reason || "unknown"}).`;
  }
}

export default function StoreDealerOnboardingActions({ leadId }: { leadId: string }) {
  const [lead, setLead] = useState<StoreLead | null>(null);
  const [account, setAccount] = useState<DealerAccountState | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const { profile } = await getCurrentProfile();
    setCanManage(["super_admin", "admin"].includes(profile?.role ?? ""));
    const { data } = await supabase.from("store_leads").select("*").eq("id", leadId).maybeSingle();
    const loadedLead = (data as StoreLead | null) ?? null;
    setLead(loadedLead);

    if (loadedLead?.converted_customer_id) {
      const { data: customer } = await supabase
        .from("customers")
        .select("status, portal_enabled")
        .eq("id", loadedLead.converted_customer_id)
        .maybeSingle();
      setAccount((customer as DealerAccountState | null) ?? null);
    } else {
      setAccount(null);
    }
    setLoading(false);
  }

  useEffect(() => { void load(); }, [leadId]);

  async function portalApi(body: Record<string, unknown>) {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error("Your Admin session has expired.");

    const response = await fetch("/api/admin/dealer-portal", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = (await response.json().catch(() => ({}))) as PortalApiResponse;
    if (!response.ok) throw new Error(payload.error || "Dealer Portal action failed.");
  }

  async function review(decision: "approve" | "reject", existingCustomerId?: string) {
    if (!lead) throw new Error("Dealer application is unavailable.");
    const trimmedReason = reason.trim();
    if (!trimmedReason) throw new Error("Enter a reason before changing Dealer lifecycle state.");

    const { data, error: rpcError } = await supabase.rpc("review_store_dealer_application", {
      p_lead_id: lead.id,
      p_decision: decision,
      p_reason: trimmedReason,
      p_existing_customer_id: existingCustomerId ?? null,
    });
    if (rpcError) throw new Error(rpcError.message);
    return (data as DealerReviewResult | null) ?? { ok: false, reason: "empty_response" };
  }

  async function approveDealer() {
    if (!lead || !canManage || lead.lead_type !== "dealer_application") return;
    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      let result = await review("approve");

      if (!result.ok && result.reason === "duplicate_customer" && result.customer_id) {
        const label = result.customer_code || result.customer_name || result.customer_id;
        const linkExisting = window.confirm(`A matching Customer already exists (${label}). Link this Dealer Application to that existing Dealer Customer?`);
        if (!linkExisting) {
          throw new Error(`A matching Customer already exists. Review it before continuing: ${result.customer_id}`);
        }
        result = await review("approve", result.customer_id);
      }

      if (!result.ok || !result.customer_id || !result.portal_user_id) {
        throw new Error(reviewError(result));
      }

      if (result.portal_user_status === "never_invited") {
        try {
          await portalApi({ action: "invite", customer_id: result.customer_id, portal_user_id: result.portal_user_id });
          setMessage(`${result.customer_code || result.customer_name || "Dealer"} approved and activated. Secure Dealer Portal invitation sent.`);
        } catch (inviteError) {
          setMessage(`${result.customer_code || result.customer_name || "Dealer"} is approved and the account is ready. Invitation delivery did not complete; rerun this same action to retry safely.`);
          setError(inviteError instanceof Error ? inviteError.message : "Dealer Portal invitation failed.");
        }
      } else if (result.portal_user_status === "suspended") {
        setMessage(`${result.customer_code || result.customer_name || "Dealer"} is linked, but the Portal user is suspended. Review lifecycle status before restoring access.`);
      } else {
        setMessage(`${result.customer_code || result.customer_name || "Dealer"} is linked and Dealer Portal access is ${result.portal_user_status || "prepared"}.`);
      }

      setReason("");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Dealer onboarding could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  async function rejectDealer() {
    if (!lead || !canManage || lead.converted_customer_id) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await review("reject");
      if (!result.ok) throw new Error(reviewError(result));
      setMessage(result.reason === "already_rejected" ? "Dealer Application is already rejected." : "Dealer Application rejected and audited.");
      setReason("");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Dealer rejection could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  async function transitionDealer(transition: "deactivate" | "reactivate") {
    if (!lead?.converted_customer_id || !canManage) return;
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setError("Enter a reason before changing Dealer lifecycle state.");
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const { data, error: rpcError } = await supabase.rpc("transition_store_dealer_account", {
        p_customer_id: lead.converted_customer_id,
        p_transition: transition,
        p_reason: trimmedReason,
      });
      if (rpcError) throw new Error(rpcError.message);
      const result = (data as DealerReviewResult | null) ?? { ok: false, reason: "empty_response" };
      if (!result.ok) throw new Error(reviewError(result));
      setMessage(transition === "deactivate" ? "Dealer deactivated. Existing Portal access is blocked immediately." : "Dealer reactivated. Eligible Portal access has been restored.");
      setReason("");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Dealer lifecycle transition failed.");
    } finally {
      setBusy(false);
    }
  }

  if (loading || !lead || lead.lead_type !== "dealer_application") return null;

  return (
    <section className={`${ADMIN_SURFACE_CARD} my-5 p-5 sm:p-6`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className={ADMIN_BRANDING_STYLES.heading}>Dealer Onboarding & Lifecycle</h2>
          <p className={`mt-1 max-w-3xl ${ADMIN_BRANDING_STYLES.muted}`}>
            One controlled workflow owns review, Customer linking/creation, Dealer account activation, Portal identity preparation and invitation. Duplicate and retry paths reuse the canonical Customer/Portal account.
          </p>
          <p className={`mt-2 ${ADMIN_BRANDING_STYLES.muted}`}>Application: {lead.status}{account ? ` · Dealer account: ${account.status} · Portal: ${account.portal_enabled ? "enabled" : "disabled"}` : ""}</p>
        </div>
        {lead.converted_customer_id ? <Link className="text-sm font-medium text-brand-500" href={`/customers/${lead.converted_customer_id}`}>Open Customer →</Link> : null}
      </div>

      {canManage ? (
        <div className="mt-5 space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Decision / lifecycle reason</span>
            <textarea className={reasonClass} value={reason} maxLength={1000} disabled={busy} onChange={(event) => setReason(event.target.value)} placeholder="Required for approve, reject, deactivate and reactivate." />
          </label>
          <div className="flex flex-wrap gap-2">
            {lead.status !== "rejected" ? <Button size="sm" disabled={busy || !reason.trim()} onClick={() => void approveDealer()}>{busy ? "Processing…" : lead.converted_customer_id ? "Retry / Continue Dealer Activation" : "Approve & Activate Dealer"}</Button> : null}
            {!lead.converted_customer_id && lead.status !== "rejected" && lead.status !== "closed" ? <Button size="sm" variant="danger" disabled={busy || !reason.trim()} onClick={() => void rejectDealer()}>Reject Dealer Application</Button> : null}
            {lead.converted_customer_id && account?.status === "active" ? <Button size="sm" variant="danger" disabled={busy || !reason.trim()} onClick={() => void transitionDealer("deactivate")}>Deactivate Dealer</Button> : null}
            {lead.converted_customer_id && account?.status === "inactive" ? <Button size="sm" variant="outline" disabled={busy || !reason.trim()} onClick={() => void transitionDealer("reactivate")}>Reactivate Dealer</Button> : null}
          </div>
        </div>
      ) : <p className={`mt-4 ${ADMIN_BRANDING_STYLES.muted}`}>Dealer lifecycle actions require Admin or Super Admin access.</p>}

      {error ? <div className={`mt-4 px-4 py-3 ${ADMIN_BRANDING_STYLES.error}`}>{error}</div> : null}
      {message ? <div className={`mt-4 px-4 py-3 ${ADMIN_BRANDING_STYLES.success}`}>{message}</div> : null}
    </section>
  );
}
