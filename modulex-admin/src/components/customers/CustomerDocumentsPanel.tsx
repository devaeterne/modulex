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
const signedAccessSeconds = 60;

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
  const [busyId, setBusyId] = useState<string | null>(null);
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

    setBusyId("upload");
    setError(null);
    setMessage(null);
    const storagePath = `${customerId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;

    const { error: uploadError } = await supabase.storage.from(bucket).upload(storagePath, file, {
      contentType: file.type || undefined,
      upsert: false,
    });
    if (uploadError) {
      setError(uploadError.message);
      setBusyId(null);
      return;
    }

    // portal_visible: false is enforced by register_customer_document and cannot be
    // promoted by the upload call itself.
    const { error: metadataError } = await supabase.rpc("register_customer_document", {
      p_customer_id: customerId,
      p_file_name: file.name,
      p_storage_path: storagePath,
      p_document_type: documentType.trim() || null,
      p_mime_type: file.type || null,
      p_file_size_bytes: file.size,
      p_description: description.trim() || null,
    });

    if (metadataError) {
      await supabase.storage.from(bucket).remove([storagePath]);
      setError(metadataError.message);
      setBusyId(null);
      return;
    }

    setFile(null);
    setDocumentType("");
    setDescription("");
    const input = document.getElementById("customer-document-file") as HTMLInputElement | null;
    if (input) input.value = "";
    await loadDocuments();
    setMessage("Document uploaded. Dealer Portal visibility is off by default.");
    setBusyId(null);
  }

  async function setPortalVisibility(documentId: string, visible: boolean) {
    if (!canManagePortal) return;
    setBusyId(documentId);
    setError(null);
    setMessage(null);
    const { error: updateError } = await supabase.rpc("set_customer_document_portal_visibility", {
      p_customer_id: customerId,
      p_document_id: documentId,
      p_visible: visible,
    });
    if (updateError) {
      setError(updateError.message);
      setBusyId(null);
      return;
    }
    await loadDocuments();
    setMessage(visible ? "Document is visible to Dealer Portal." : "Document is hidden from Dealer Portal.");
    setBusyId(null);
  }

  async function openSignedDocument(item: CustomerDocument, download: boolean) {
    setBusyId(item.id);
    setError(null);
    setMessage(null);
    const { data, error: signedUrlError } = await supabase.storage
      .from(item.storage_bucket || bucket)
      .createSignedUrl(
        item.storage_path,
        signedAccessSeconds,
        download ? { download: item.file_name } : undefined
      );

    if (signedUrlError || !data?.signedUrl) {
      setError(signedUrlError?.message || "Unable to create private document access link.");
      setBusyId(null);
      return;
    }

    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    setBusyId(null);
  }

  async function deactivateDocument(item: CustomerDocument) {
    if (!canUpload || !confirm(`Deactivate ${item.file_name}? The private file will be retained for history.`)) return;
    setBusyId(item.id);
    setError(null);
    setMessage(null);
    const { error: deactivateError } = await supabase.rpc("deactivate_customer_document", {
      p_customer_id: customerId,
      p_document_id: item.id,
    });
    if (deactivateError) {
      setError(deactivateError.message);
      setBusyId(null);
      return;
    }
    await loadDocuments();
    setMessage("Document deactivated. The private file was retained for audit/history.");
    setBusyId(null);
  }

  return (
    <div className="mb-5">
      <ComponentCard
        title="Customer Documents"
        desc="Files stay private. Access uses a short-lived signed link and Dealer visibility must be enabled explicitly by an Admin."
      >
        {error ? <Alert variant="error" title="Document action failed" message={error} /> : null}
        {message ? <Alert variant="success" title="Documents updated" message={message} /> : null}

        {canUpload ? (
          <form onSubmit={uploadDocument} className="mb-6 grid gap-3 md:grid-cols-2">
            <div>
              <Label htmlFor="customer-document-file">File</Label>
              <Input
                id="customer-document-file"
                type="file"
                required
                disabled={busyId !== null}
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </div>
            <div>
              <Label htmlFor="customer-document-type">Document type</Label>
              <Input
                id="customer-document-type"
                value={documentType}
                disabled={busyId !== null}
                onChange={(event) => setDocumentType(event.target.value)}
                placeholder="Specification, agreement, drawing…"
              />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="customer-document-description">Description</Label>
              <Input
                id="customer-document-description"
                value={description}
                disabled={busyId !== null}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
            <div className="md:col-span-2 flex justify-end">
              <Button type="submit" disabled={busyId !== null || !file}>
                {busyId === "upload" ? "Uploading…" : "Upload document"}
              </Button>
            </div>
          </form>
        ) : null}

        <div className="space-y-3">
          {documents.length === 0 ? (
            <Alert variant="info" title="No documents" message="No active documents." />
          ) : documents.map((item) => (
            <ComponentCard
              key={item.id}
              title={item.file_name}
              desc={`${item.document_type || "Document"}${item.description ? ` · ${item.description}` : ""}`}
              headerAction={
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" disabled={busyId !== null} onClick={() => void openSignedDocument(item, false)}>Preview</Button>
                  <Button size="sm" variant="outline" disabled={busyId !== null} onClick={() => void openSignedDocument(item, true)}>Download</Button>
                  {canUpload ? <Button size="sm" variant="danger" disabled={busyId !== null} onClick={() => void deactivateDocument(item)}>Deactivate</Button> : null}
                </div>
              }
            >
              <FormHint>Dealer Portal: {item.portal_visible ? "Visible" : "Hidden"}</FormHint>
              <Checkbox
                label="Visible to Dealer Portal"
                checked={item.portal_visible}
                disabled={!canManagePortal || busyId !== null}
                onChange={(checked) => void setPortalVisibility(item.id, checked)}
              />
            </ComponentCard>
          ))}
        </div>
      </ComponentCard>
    </div>
  );
}
