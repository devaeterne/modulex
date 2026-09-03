"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import FormHint from "@/components/form/FormHint";
import Checkbox from "@/components/form/input/Checkbox";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import Alert from "@/components/ui/alert/Alert";
import Button from "@/components/ui/button/Button";
import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { loadCustomerDocuments } from "@/lib/customers/read-dedup";
import type { CustomerDocument } from "@/lib/customers/types";

const bucket = "customer-documents";
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
    <div className="mb-5">
    <ComponentCard title="Customer Documents" desc="Files are stored in the private customer-documents bucket. Dealer visibility must be enabled explicitly by an Admin.">
      {error ? <Alert variant="error" title="Document action failed" message={error} /> : null}
      {message ? <Alert variant="success" title="Documents updated" message={message} /> : null}

      {canUpload ? (
        <form onSubmit={uploadDocument} className="mb-6 grid gap-3 md:grid-cols-2">
          <div>
            <Label htmlFor="customer-document-file">File</Label>
            <Input id="customer-document-file" type="file" required disabled={busy} onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
          </div>
          <div>
            <Label htmlFor="customer-document-type">Document type</Label>
            <Input id="customer-document-type" value={documentType} disabled={busy} onChange={(event) => setDocumentType(event.target.value)} placeholder="Specification, agreement, drawing…" />
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="customer-document-description">Description</Label>
            <Input id="customer-document-description" value={description} disabled={busy} onChange={(event) => setDescription(event.target.value)} />
          </div>
          <div className="md:col-span-2 flex justify-end">
            <Button type="submit" disabled={busy || !file}>{busy ? "Uploading…" : "Upload document"}</Button>
          </div>
        </form>
      ) : null}

      <div className="space-y-3">
        {documents.length === 0 ? <Alert variant="info" title="No documents" message="No active documents." /> : documents.map((item) => (
          <div key={item.id} className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-medium">{item.file_name}</p>
              <FormHint>{item.document_type || "Document"}{item.description ? ` · ${item.description}` : ""}</FormHint>
              <FormHint>Dealer Portal: {item.portal_visible ? "Visible" : "Hidden"}</FormHint>
            </div>
            <Checkbox
                label="Visible to Dealer Portal"
                checked={item.portal_visible}
                disabled={!canManagePortal || busy}
                onChange={(checked) => void setPortalVisibility(item.id, checked)}
              />
          </div>
        ))}
      </div>
    </ComponentCard>
    </div>
  );
}
