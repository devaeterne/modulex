"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { loadCustomerDocuments } from "@/lib/customers/read-dedup";
import type { CustomerDocument } from "@/lib/customers/types";

const bucket = "customer-documents";
const inputClass = "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-theme-xs transition focus:border-brand-300 focus:outline-none focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";
const buttonClass = "inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white shadow-theme-xs transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50";

function safeFileName(name: string) {
  const cleaned = name.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-");
  return cleaned || "document";
}

export default function CustomerDocumentsPanel({ customerId }: { customerId: string }) {
  const [documents, setDocuments] = useState<CustomerDocument[]>([]);
  const [canUpload, setCanUpload] = useState(false);
  const [canManagePortal, setCanManagePortal] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [documentType, setDocumentType] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadDocuments = useCallback(async () => {
    const data = await loadCustomerDocuments(customerId);
    setDocuments(data);
  }, [customerId]);

  useEffect(() => {
    async function initialize() {
      try {
        const [{ profile, error: profileError }] = await Promise.all([
          getCurrentProfile(),
          loadDocuments(),
        ]);
        if (profileError) throw profileError;
        const role = profile?.role ?? "";
        setCanUpload(["super_admin", "admin", "sales"].includes(role));
        setCanManagePortal(["super_admin", "admin"].includes(role));
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Unable to load customer documents.");
      }
    }
    void initialize();
  }, [loadDocuments]);

  async function uploadDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canUpload || !file) return;

    setBusy(true);
    setError(null);
    setMessage(null);
    const storagePath = `${customerId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;

    const { error: uploadError } = await supabase.storage.from(bucket).upload(storagePath, file, {
      contentType: file.type || undefined,
      upsert: false,
    });
    if (uploadError) {
      setError(uploadError.message);
      setBusy(false);
      return;
    }

    const { error: metadataError } = await supabase.from("customer_documents").insert({
      customer_id: customerId,
      document_type: documentType.trim() || null,
      file_name: file.name,
      storage_bucket: bucket,
      storage_path: storagePath,
      mime_type: file.type || null,
      file_size_bytes: file.size,
      description: description.trim() || null,
      is_active: true,
      portal_visible: false,
    });

    if (metadataError) {
      await supabase.storage.from(bucket).remove([storagePath]);
      setError(metadataError.message);
      setBusy(false);
      return;
    }

    setFile(null);
    setDocumentType("");
    setDescription("");
    const input = document.getElementById("customer-document-file") as HTMLInputElement | null;
    if (input) input.value = "";
    await loadDocuments();
    setMessage("Document uploaded. Dealer Portal visibility is off by default.");
    setBusy(false);
  }

  async function setPortalVisibility(documentId: string, visible: boolean) {
    if (!canManagePortal) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    const { error: updateError } = await supabase
      .from("customer_documents")
      .update({ portal_visible: visible })
      .eq("id", documentId)
      .eq("customer_id", customerId);
    if (updateError) {
      setError(updateError.message);
      setBusy(false);
      return;
    }
    await loadDocuments();
    setMessage(visible ? "Document is visible to Dealer Portal." : "Document is hidden from Dealer Portal.");
    setBusy(false);
  }

  return (
    <section className="mb-5 rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900 sm:p-6">
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Customer Documents</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Files are stored in the private customer-documents bucket. Dealer visibility must be enabled explicitly by an Admin.
        </p>
      </div>

      {error ? <div className="mb-4 rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400">{error}</div> : null}
      {message ? <div className="mb-4 rounded-lg border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700 dark:border-success-500/30 dark:bg-success-500/10 dark:text-success-400">{message}</div> : null}

      {canUpload ? (
        <form onSubmit={uploadDocument} className="mb-6 grid gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.02] md:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300" htmlFor="customer-document-file">File</label>
            <input id="customer-document-file" type="file" required disabled={busy} onChange={(event) => setFile(event.target.files?.[0] ?? null)} className={inputClass} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300" htmlFor="customer-document-type">Document type</label>
            <input id="customer-document-type" value={documentType} disabled={busy} onChange={(event) => setDocumentType(event.target.value)} className={inputClass} placeholder="Specification, agreement, drawing…" />
          </div>
          <div className="md:col-span-2">
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300" htmlFor="customer-document-description">Description</label>
            <input id="customer-document-description" value={description} disabled={busy} onChange={(event) => setDescription(event.target.value)} className={inputClass} />
          </div>
          <div className="md:col-span-2 flex justify-end">
            <button type="submit" disabled={busy || !file} className={buttonClass}>{busy ? "Uploading…" : "Upload document"}</button>
          </div>
        </form>
      ) : null}

      <div className="space-y-3">
        {documents.length === 0 ? <div className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500 dark:border-gray-700">No active documents.</div> : documents.map((item) => (
          <div key={item.id} className="flex flex-col gap-3 rounded-xl border border-gray-200 p-4 dark:border-gray-800 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-medium text-gray-800 dark:text-white/90">{item.file_name}</p>
              <p className="mt-1 text-xs text-gray-500">{item.document_type || "Document"}{item.description ? ` · ${item.description}` : ""}</p>
              <p className="mt-1 text-xs text-gray-400">Dealer Portal: {item.portal_visible ? "Visible" : "Hidden"}</p>
            </div>
            <label className="inline-flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
              <input
                type="checkbox"
                checked={item.portal_visible}
                disabled={!canManagePortal || busy}
                onChange={(event) => void setPortalVisibility(item.id, event.target.checked)}
                className="h-4 w-4 accent-brand-500"
              />
              Visible to Dealer Portal
            </label>
          </div>
        ))}
      </div>
    </section>
  );
}
