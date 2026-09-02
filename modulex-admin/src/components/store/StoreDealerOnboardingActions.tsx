"use client";

import { useEffect, useState } from "react";
import Button from "@/components/ui/button/Button";
import { ADMIN_BRANDING_STYLES, ADMIN_SURFACE_CARD } from "@/components/ui/theme/adminTheme";
import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";
import type { StoreLead } from "@/lib/store/leads";

type DealerConversionResult = {
  ok: boolean;
  reason?: string;
  customer_id?: string;
  customer_code?: string;
  customer_name?: string;
};

type DealerPortalUser = {
  id: string;
  login_email: string;
  status: "never_invited" | "invited" | "active" | "suspended";
};

type PortalApiResponse = {
  error?: string;
  portal_user?: DealerPortalUser;
};

export default function StoreDealerOnboardingActions({ leadId }: { leadId: string }) {
  const [lead, setLead] = useState<StoreLead | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const { profile } = await getCurrentProfile();
    setCanManage(["super_admin", "admin"].includes(profile?.role ?? ""));
    const { data } = await supabase.from("store_leads").select("*").eq("id", leadId).maybeSingle();
    setLead((data as StoreLead | null) ?? null);
    setLoading(false);
  }

  useEffect(() => { void load(); }, [leadId]);

  async function portalApi(method: "POST" | "PATCH", body: Record<string, unknown>) {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error("Your Admin session has expired.");

    const response = await fetch("/api/admin/dealer-portal", {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = (await response.json().catch(() => ({}))) as PortalApiResponse;
    if (!response.ok) throw new Error(payload.error || "Dealer portal action failed.");
    return payload;
  }

  async function ensureDealerPortal(customerId: string, currentLead: StoreLead) {
    await portalApi("PATCH", { action: "enable_portal", customer_id: customerId });

    const email = currentLead.email.trim().toLowerCase();
    const { data: existingUsers, error: usersError } = await supabase
      .from("customer_portal_users")
      .select("id, login_email, status")
      .eq("customer_id", customerId);
    if (usersError) throw new Error(usersError.message);

    let portalUser = (existingUsers ?? []).find((item) => item.login_email.trim().toLowerCase() === email) as DealerPortalUser | undefined;
    if (!portalUser) {
      const created = await portalApi("POST", {
        customer_id: customerId,
        full_name: `${currentLead.first_name} ${currentLead.last_name}`.trim(),
        login_email: email,
        portal_role: "admin",
        is_primary: true,
      });
      if (!created.portal_user?.id) throw new Error("Dealer portal user could not be created.");
      portalUser = created.portal_user;
    }

    if (portalUser.status === "suspended") {
      throw new Error("The dealer portal user is suspended. Review Customer Portal Access before continuing.");
    }
    if (portalUser.status === "never_invited") {
      await portalApi("PATCH", { action: "invite", customer_id: customerId, portal_user_id: portalUser.id });
      return "invited" as const;
    }
    return portalUser.status;
  }

  async function onboardDealer() {
    if (!lead || !canManage || lead.lead_type !== "dealer_application") return;
    if (lead.status === "rejected") {
      setError("Rejected dealer applications cannot be onboarded until the review decision is changed.");
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      let workingLead = lead;
      let customerId = lead.converted_customer_id || null;
      let customerLabel = "Dealer customer";

      if (!customerId) {
        if (lead.status !== "approved") {
          const { data: approved, error: approvalError } = await supabase
            .from("store_leads")
            .update({ status: "approved" })
            .eq("id", lead.id)
            .select("*")
            .single();
          if (approvalError || !approved) throw new Error(approvalError?.message || "Dealer application could not be approved.");
          workingLead = approved as StoreLead;
        }

        const { data, error: conversionError } = await supabase.rpc("convert_store_dealer_lead_to_customer", { p_lead_id: lead.id });
        if (conversionError) throw new Error(conversionError.message);
        const result = data as DealerConversionResult | null;
        if (!result?.ok) {
          if (result?.reason === "duplicate_customer" && result.customer_id) {
            throw new Error(`A matching customer already exists${result.customer_code ? ` (${result.customer_code})` : ""}. Review customer ${result.customer_id}; A4 does not auto-link duplicate customers.`);
          }
          throw new Error(`Dealer customer conversion failed (${result?.reason || "unknown"}).`);
        }
        customerId = result.customer_id || null;
        customerLabel = result.customer_code || result.customer_name || customerLabel;
        if (!customerId) throw new Error("Dealer conversion returned no customer id.");
      }

      const portalStatus = await ensureDealerPortal(customerId, workingLead);
      if (portalStatus === "active") setMessage(`${customerLabel} already has active Dealer Portal access.`);
      else if (portalStatus === "invited") setMessage(`${customerLabel} is ready and the secure activation invitation is pending at ${workingLead.email}.`);
      else setMessage(`${customerLabel} onboarding is already in progress (${portalStatus}).`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Dealer onboarding could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  async function rejectDealer() {
    if (!lead || !canManage || lead.converted_customer_id) return;
    if (!window.confirm("Reject this dealer application? The status change will be recorded in the activity timeline.")) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    const { error: rejectError } = await supabase.from("store_leads").update({ status: "rejected" }).eq("id", lead.id);
    if (rejectError) setError(rejectError.message);
    else {
      setMessage("Dealer application rejected.");
      await load();
    }
    setBusy(false);
  }

  if (loading || !lead || lead.lead_type !== "dealer_application") return null;

  return (
    <section className={`${ADMIN_SURFACE_CARD} mb-5 p-5 sm:p-6`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className={ADMIN_BRANDING_STYLES.heading}>Dealer Onboarding</h2>
          <p className={`mt-1 ${ADMIN_BRANDING_STYLES.muted}`}>
            Approval creates the dealer customer, enables Store Portal access, prepares the primary dealer user, and sends the secure activation invitation. Active status is reached only after the dealer completes password setup.
          </p>
        </div>
        {canManage ? (
          <div className="flex flex-wrap gap-2">
            {lead.status !== "rejected" ? (
              <Button size="sm" disabled={busy} onClick={() => void onboardDealer()}>
                {busy ? "Processing…" : lead.converted_customer_id ? "Continue Dealer Onboarding" : "Approve & Start Dealer Onboarding"}
              </Button>
            ) : null}
            {!lead.converted_customer_id && lead.status !== "rejected" && lead.status !== "closed" ? (
              <Button size="sm" variant="danger" disabled={busy} onClick={() => void rejectDealer()}>
                Reject Dealer Application
              </Button>
            ) : null}
          </div>
        ) : (
          <p className={ADMIN_BRANDING_STYLES.muted}>Dealer approval and portal invitation require Admin or Super Admin access.</p>
        )}
      </div>
      {error ? <div className={`mt-4 px-4 py-3 ${ADMIN_BRANDING_STYLES.error}`}>{error}</div> : null}
      {message ? <div className={`mt-4 px-4 py-3 ${ADMIN_BRANDING_STYLES.success}`}>{message}</div> : null}
    </section>
  );
}
