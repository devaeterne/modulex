"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import type { CustomerInstallation, CustomerInstallationStatus } from "@/lib/customers/installation-types";

const statuses: CustomerInstallationStatus[] = ["scheduled", "confirmed", "in_progress", "completed", "cancelled"];
const inputClass = "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";
function titleCase(value: string) { return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()); }
function dateTime(value: string | null | undefined) { if (!value) return "—"; return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }

export default function CustomerInstallationDetail() {
  const params = useParams<{ id: string; installationId: string }>();
  const [item, setItem] = useState<CustomerInstallation | null>(null);
  const [status, setStatus] = useState<CustomerInstallationStatus>("scheduled");
  const [completionNotes, setCompletionNotes] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function load() {
    const { data, error } = await supabase.from("customer_installations").select("*").eq("id", params.installationId).eq("customer_id", params.id).single();
    if (error) { setErrorMessage(error.message); setIsLoading(false); return; }
    const installation = data as CustomerInstallation;
    setItem(installation);
    setStatus(installation.status);
    setCompletionNotes(installation.completion_notes || "");
    setIsLoading(false);
  }

  useEffect(() => { load(); }, [params.id, params.installationId]);

  async function updateStatus() {
    if (!item || status === item.status) return;
    setIsSaving(true); setErrorMessage(null); setSuccessMessage(null);
    const { error } = await supabase.rpc("set_customer_installation_status", {
      p_installation_id: item.id,
      p_status: status,
      p_completion_notes: status === "completed" ? completionNotes.trim() || null : null,
    });
    if (error) { setErrorMessage(error.message); setIsSaving(false); return; }
    await load();
    setSuccessMessage("Installation status updated.");
    setIsSaving(false);
  }

  if (isLoading) return <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 dark:border-gray-800 dark:bg-gray-900">Loading installation...</div>;
  if (!item) return <div className="rounded-xl border border-error-200 bg-error-50 p-5 text-error-700">{errorMessage || "Installation not found."}</div>;

  const address = item.address_snapshot as Record<string, string | null> | null;

  return <div className="space-y-5">
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900"><div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">{item.installation_number}</h1><p className="mt-2 text-sm text-gray-500">{dateTime(item.scheduled_start_at)}{item.scheduled_end_at ? ` → ${dateTime(item.scheduled_end_at)}` : ""}</p></div><div className="flex gap-2"><Link href={`/customers/${item.customer_id}/orders/${item.order_id}`} className="h-10 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 dark:border-gray-700 dark:text-gray-300">Open Order</Link><Link href="/customers/installations" className="h-10 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 dark:border-gray-700 dark:text-gray-300">All Installations</Link></div></div></div>
    {errorMessage && <div className="rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700">{errorMessage}</div>}
    {successMessage && <div className="rounded-xl border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700">{successMessage}</div>}
    <div className="grid gap-5 xl:grid-cols-3">
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900 xl:col-span-2"><h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Appointment</h2><div className="mt-4 grid gap-4 md:grid-cols-2"><Info label="Status" value={titleCase(item.status)} /><Info label="Team" value={item.team_name} /><Info label="Contact" value={item.contact_name} /><Info label="Phone" value={item.contact_phone} /><Info label="Assigned User ID" value={item.assigned_to} /><Info label="Shipment ID" value={item.shipment_id} /></div><div className="mt-5"><p className="text-xs font-medium uppercase text-gray-400">Address</p><p className="mt-2 whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">{address ? [address.address_line_1, address.address_line_2, address.postal_code, address.city, address.state_region, address.country_code].filter(Boolean).join(", ") : "—"}</p></div><div className="mt-5 grid gap-4 md:grid-cols-2"><Info label="Notes" value={item.notes} /><Info label="Internal Notes" value={item.internal_notes} /></div></div>
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900"><h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Workflow</h2><div className="mt-4 space-y-3"><select value={status} onChange={(e) => setStatus(e.target.value as CustomerInstallationStatus)} disabled={["completed","cancelled"].includes(item.status)} className={inputClass}>{statuses.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}</select>{status === "completed" && <textarea value={completionNotes} onChange={(e) => setCompletionNotes(e.target.value)} rows={4} placeholder="Completion notes" className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90" />}<button onClick={updateStatus} disabled={isSaving || status === item.status || ["completed","cancelled"].includes(item.status)} className="h-10 w-full rounded-lg bg-brand-500 px-4 text-sm font-medium text-white disabled:opacity-40">{isSaving ? "Saving..." : "Update Status"}</button></div><div className="mt-5 space-y-2 border-t border-gray-100 pt-4 text-xs text-gray-500 dark:border-gray-800"><div>Confirmed: {dateTime(item.confirmed_at)}</div><div>Started: {dateTime(item.started_at)}</div><div>Completed: {dateTime(item.completed_at)}</div><div>Cancelled: {dateTime(item.cancelled_at)}</div></div></div>
    </div>
  </div>;
}

function Info({ label, value }: { label: string; value: string | null }) { return <div><p className="text-xs font-medium uppercase text-gray-400">{label}</p><p className="mt-2 whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">{value || "—"}</p></div>; }
