"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import type { ProfileLookup } from "@/lib/customers/types";

const inputClass = "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30";

export default function CreateInstallationFromOrder() {
  const params = useParams<{ id: string; orderId: string }>();
  const router = useRouter();
  const [open, setOpen] = useState(false);
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
    if (!open || profiles.length) return;
    supabase
      .from("profiles")
      .select("id,full_name,email,role,is_active")
      .eq("is_active", true)
      .order("full_name")
      .then(({ data }) => setProfiles((data ?? []) as ProfileLookup[]));
  }, [open, profiles.length]);

  async function createInstallation() {
    if (!startAt) {
      setErrorMessage("Scheduled start is required.");
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

    if (error) {
      setErrorMessage(error.message);
      setIsSaving(false);
      return;
    }

    router.push(`/customers/${params.id}/installations/${data}`);
    router.refresh();
  }

  return (
    <div className="mb-5 rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">Installation Appointment</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Schedule installation directly from this order.</p>
        </div>
        <button onClick={() => setOpen((value) => !value)} className="h-10 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white transition hover:bg-brand-600 dark:hover:bg-brand-600">
          {open ? "Close" : "Schedule Installation"}
        </button>
      </div>

      {open && (
        <div className="mt-5 border-t border-gray-100 pt-5 dark:border-gray-800">
          {errorMessage && <div className="mb-4 rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400">{errorMessage}</div>}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <label className="text-sm text-gray-600 dark:text-gray-300">Start<input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} className={`mt-1 ${inputClass}`} /></label>
            <label className="text-sm text-gray-600 dark:text-gray-300">End<input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} className={`mt-1 ${inputClass}`} /></label>
            <label className="text-sm text-gray-600 dark:text-gray-300">Assigned User<select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} className={`mt-1 ${inputClass}`}><option value="">Unassigned</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.full_name || profile.email || profile.id}</option>)}</select></label>
            <label className="text-sm text-gray-600 dark:text-gray-300">Team<input value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="Installation team" className={`mt-1 ${inputClass}`} /></label>
            <label className="text-sm text-gray-600 dark:text-gray-300">Contact Name<input value={contactName} onChange={(e) => setContactName(e.target.value)} className={`mt-1 ${inputClass}`} /></label>
            <label className="text-sm text-gray-600 dark:text-gray-300">Contact Phone<input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} className={`mt-1 ${inputClass}`} /></label>
          </div>
          <label className="mt-3 block text-sm text-gray-600 dark:text-gray-300">Notes<textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:border-brand-300 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30" /></label>
          <div className="mt-4 flex justify-end"><button disabled={isSaving} onClick={createInstallation} className="h-10 rounded-lg bg-brand-500 px-5 text-sm font-medium text-white transition hover:bg-brand-600 disabled:opacity-50 dark:hover:bg-brand-600">{isSaving ? "Scheduling..." : "Create Appointment"}</button></div>
        </div>
      )}
    </div>
  );
}
