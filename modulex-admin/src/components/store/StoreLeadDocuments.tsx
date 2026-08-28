"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";

type LeadDocument = {
  id: string;
  document_type: "business_license" | "resale_certificate" | "showroom_company_documentation" | "other";
  storage_path: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
};

const documentLabels: Record<LeadDocument["document_type"], string> = {
  business_license: "Business license / registration",
  resale_certificate: "Resale certificate",
  showroom_company_documentation: "Showroom / company documentation",
  other: "Other supporting document",
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function StoreLeadDocuments({ id }: { id: string }) {
  const [dealer, setDealer] = useState(false);
  const [documents, setDocuments] = useState<LeadDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      const { profile, error: profileError } = await getCurrentProfile();
      if (profileError || !profile || !["super_admin", "admin", "sales"].includes(profile.role)) {
        if (active) { setError("You do not have access to supporting documents."); setLoading(false); }
        return;
      }
      const { data: lead, error: leadError } = await supabase.from("store_leads").select("lead_type").eq("id", id).single();
      if (leadError || !lead) { if (active) { setError(leadError?.message || "Unable to load lead."); setLoading(false); } return; }
      if (lead.lead_type !== "dealer_application") { if (active) setLoading(false); return; }
      const { data, error: documentError } = await supabase.from("store_lead_documents").select("id, document_type, storage_path, original_filename, mime_type, size_bytes, created_at").eq("lead_id", id).order("created_at", { ascending: false });
      if (!active) return;
      setDealer(true);
      if (documentError) setError(documentError.message);
      else setDocuments((data ?? []) as LeadDocument[]);
      setLoading(false);
    }
    void load();
    return () => { active = false; };
  }, [id]);

  async function openDocument(document: LeadDocument) {
    setOpening(document.id);
    setError(null);
    const { data, error: signedUrlError } = await supabase.storage.from("dealer-supporting-documents").createSignedUrl(document.storage_path, 60);
    if (signedUrlError || !data?.signedUrl) setError(signedUrlError?.message || "Unable to open document.");
    else window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    setOpening(null);
  }

  if (loading || !dealer) return null;
  return (
    <section className="mt-5 rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div><h2 className="font-semibold text-gray-800 dark:text-white/90">Supporting Documents</h2><p className="mt-1 text-sm text-gray-500">Private dealer-application documents. Links expire after 60 seconds.</p></div>
        <span className="text-sm text-gray-500">{documents.length} file{documents.length === 1 ? "" : "s"}</span>
      </div>
      {error ? <div className="mt-4 rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700">{error}</div> : null}
      <div className="mt-4 space-y-3">
        {documents.map((document) => (
          <div key={document.id} className="flex flex-col gap-3 rounded-xl border border-gray-100 p-4 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0"><p className="truncate text-sm font-medium text-gray-800 dark:text-white/90">{document.original_filename}</p><p className="mt-1 text-xs text-gray-500">{documentLabels[document.document_type]} · {formatBytes(document.size_bytes)}</p></div>
            <button type="button" className="inline-flex h-9 items-center justify-center rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300" disabled={opening === document.id} onClick={() => void openDocument(document)}>{opening === document.id ? "Opening..." : "Open"}</button>
          </div>
        ))}
        {documents.length === 0 ? <p className="text-sm text-gray-500">No supporting documents were submitted.</p> : null}
      </div>
    </section>
  );
}
