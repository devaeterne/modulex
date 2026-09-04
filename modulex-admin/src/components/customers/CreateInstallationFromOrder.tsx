"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ComponentCard from "@/components/common/ComponentCard";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import Select from "@/components/form/Select";
import TextArea from "@/components/form/input/TextArea";
import Alert from "@/components/ui/alert/Alert";
import Button from "@/components/ui/button/Button";
import { authenticatedFetch } from "@/lib/auth/authenticated-fetch";
import { supabase } from "@/lib/supabase/client";
import { loadCustomerOrderRecord } from "@/lib/customers/order-domain";
import type { OrderFulfillmentType, ProfileLookup } from "@/lib/customers/types";
import { isValidPhone, sanitizePhoneInput } from "@/lib/validation";

export default function CreateInstallationFromOrder() {
  const params = useParams<{ id: string; orderId: string }>();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [fulfillmentType, setFulfillmentType] = useState<OrderFulfillmentType | null>(null);
  const [profiles, setProfiles] = useState<ProfileLookup[]>([]);
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [teamName, setTeamName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    loadCustomerOrderRecord(params.id, params.orderId)
      .then((order) => setFulfillmentType(order.fulfillment_type ?? "delivery"))
      .catch((error: unknown) => {
        setErrorMessage(error instanceof Error ? error.message : "Unable to load order.");
      });
  }, [params.id, params.orderId]);

  useEffect(() => {
    if (!open || profiles.length) return;
    supabase.from("profiles").select("id,full_name,email,role,is_active").eq("is_active", true).order("full_name")
      .then(({ data }) => setProfiles((data ?? []) as ProfileLookup[]));
  }, [open, profiles.length]);

  async function createInstallation() {
    if (fulfillmentType !== "delivery_installation") {
      setErrorMessage("This order must use Delivery + Installation fulfillment before an installation can be scheduled.");
      return;
    }
    if (!startAt) { setErrorMessage("Scheduled start is required."); return; }
    if (contactPhone.trim() && !isValidPhone(contactPhone)) {
      setErrorMessage("Enter a valid contact phone number using 7 to 15 digits. Letters are not allowed.");
      return;
    }
    setIsSaving(true);
    setErrorMessage(null);

    const { data, error } = await supabase.rpc("create_customer_installation_from_order", {
      p_order_id: params.orderId,
      p_scheduled_start_at: new Date(startAt).toISOString(),
      p_scheduled_end_at: endAt ? new Date(endAt).toISOString() : null,
      p_assigned_to: assignedTo || null,
      p_team_name: teamName.trim() || null,
      p_contact_name: contactName.trim() || null,
      p_contact_phone: contactPhone.trim() || null,
      p_notes: notes.trim() || null,
      p_internal_notes: null,
      p_shipment_id: null,
    });
    if (error) { setErrorMessage(error.message); setIsSaving(false); return; }

    const installationId = String(data);
    void authenticatedFetch(`/api/admin/google-calendar/installations/${installationId}/sync`, { method: "POST" })
      .catch(() => undefined);

    router.push(`/customers/${params.id}/installations/${installationId}`);
    router.refresh();
  }

  const installationReady = fulfillmentType === "delivery_installation";

  return <div className="mb-5">
    <ComponentCard
      title="Installation Appointment"
      desc="Schedule installation directly from this order."
      headerAction={installationReady ? <Button size="sm" onClick={() => setOpen((value) => !value)}>{open ? "Close" : "Schedule Installation"}</Button> : <Button size="sm" variant="outline" onClick={() => router.push(`/customers/${params.id}/orders/${params.orderId}/edit`)}>Set Delivery + Installation</Button>}
    >
      {!installationReady && fulfillmentType !== null ? <Alert variant="warning" title="Installation unavailable" message={`Current fulfillment is ${fulfillmentType === "pickup" ? "Customer Pickup" : "Delivery"}. Installation scheduling is blocked until the order is classified as Delivery + Installation. If a Sales user changes a confirmed order, that revision must be approved first.`} /> : null}
      {open && installationReady ? <div className="space-y-4">
        {errorMessage ? <Alert variant="error" title="Unable to schedule installation" message={errorMessage} /> : null}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <div><Label>Start</Label><Input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} /></div>
          <div><Label>End</Label><Input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} /></div>
          <div><Label>Assigned User</Label><Select allowEmpty placeholder="Unassigned" options={profiles.map((profile) => ({ value: profile.id, label: profile.full_name || profile.email || profile.id }))} value={assignedTo} onChange={setAssignedTo} /></div>
          <div><Label>Team</Label><Input value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="Installation team" /></div>
          <div><Label>Contact Name</Label><Input value={contactName} onChange={(e) => setContactName(e.target.value)} /></div>
          <div><Label>Contact Phone</Label><Input type="tel" inputMode="tel" autoComplete="tel" maxLength={24} value={contactPhone} onChange={(e) => setContactPhone(sanitizePhoneInput(e.target.value))} placeholder="+1 (202) 555-0123" /></div>
        </div>
        <div><Label>Notes</Label><TextArea value={notes} onChange={setNotes} rows={3} /></div>
        <div className="flex justify-end"><Button disabled={isSaving} onClick={() => void createInstallation()}>{isSaving ? "Scheduling..." : "Create Appointment"}</Button></div>
      </div> : null}
    </ComponentCard>
  </div>;
}
