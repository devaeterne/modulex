"use client";

import { useEffect, useState } from "react";
import Button from "@/components/ui/button/Button";
import {
  ADMIN_STATUS_TONES,
  ADMIN_SURFACE_CARD,
  ADMIN_TEXT_STYLES,
} from "@/components/ui/theme/adminTheme";
import { supabase } from "@/lib/supabase/client";
import type { StoreLeadDetailPayload } from "@/lib/store/leads";

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

const cardClass = `${ADMIN_SURFACE_CARD} mt-5 p-5 sm:p-6`;
const documentCardClass = `${ADMIN_SURFACE_CARD} p-4`;
const errorClass = `${ADMIN_STATUS_TONES.light.error} mt-4 px-4 py-3 text-sm`;

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
      const { data: detailData, error: leadError } = await supabase.rpc("get_store_lead_detail", { p_lead_id: id });
      if (!active) return;
      if (leadError) {
        setError(leadError.message);
        setLoading(false);
        return;
      }
      const detail = detailData as StoreLeadDetailPayload | null;
      if (!detail?.ok || !detail.lead) {
        setError("Lead not found or not available to your role.");
        setLoading(false);
        return;
      }
      if (detail.lead.lead_type !== "dealer_application") {
        setLoading(false);
        return;
      }

      const { data, error: documentError } = await supabase
        .from("store_lead_documents")
        .select("id, document_type, storage_path, original_filename, mime_type, size_bytes, created_at")
        .eq("lead_id", id)
        .order("created_at", { ascending: false });
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
    <section className={cardClass}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className={`font-semibold ${ADMIN_TEXT_STYLES.strong}`}>Supporting Documents</h2>
          <p className={`mt-1 text-sm ${ADMIN_TEXT_STYLES.muted}`}>Private dealer-application documents. Links expire after 60 seconds.</p>
        </div>
        <span className={`text-sm ${ADMIN_TEXT_STYLES.muted}`}>{documents.length} file{documents.length === 1 ? "" : "s"}</span>
      </div>
      {error ? <div className={errorClass}>{error}</div> : null}
      <div className="mt-4 space-y-3">
        {documents.map((document) => (
          <div key={document.id} className={`${documentCardClass} flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`}>
            <div className="min-w-0">
              <p className={`truncate text-sm font-medium ${ADMIN_TEXT_STYLES.strong}`}>{document.original_filename}</p>
              <p className={`mt-1 text-xs ${ADMIN_TEXT_STYLES.muted}`}>{documentLabels[document.document_type]} · {formatBytes(document.size_bytes)}</p>
            </div>
            <Button size="sm" variant="outline" disabled={opening === document.id} onClick={() => void openDocument(document)}>
              {opening === document.id ? "Opening..." : "Open"}
            </Button>
          </div>
        ))}
        {documents.length === 0 ? <p className={`text-sm ${ADMIN_TEXT_STYLES.muted}`}>No supporting documents were submitted.</p> : null}
      </div>
    </section>
  );
}