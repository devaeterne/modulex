"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import FormHint from "@/components/form/FormHint";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import Select from "@/components/form/Select";
import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
  TableStateRow,
  TableViewport,
} from "@/components/ui/table";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { supabase } from "@/lib/supabase/client";
import { formatDateTime } from "@/lib/dates/usDate";

export type EntityDocumentType = "project" | "order";

type EntityDocument = {
  id: string;
  entity_type: EntityDocumentType;
  entity_id: string;
  source_label: string;
  document_type: string;
  file_name: string;
  storage_bucket: string;
  storage_path: string;
  mime_type: string;
  file_size_bytes: number;
  description: string | null;
  uploaded_by: string | null;
  uploaded_by_name: string | null;
  created_at: string;
};

type OrphanCleanup = {
  storagePath: string;
  fileName: string;
};

type Props = {
  entityType: EntityDocumentType;
  entityId: string;
  includeLinkedOrders?: boolean;
  title?: string;
};

const bucket = "entity-documents";
const signedAccessSeconds = 60;
const maxFileSize = 25 * 1024 * 1024;
const acceptedExtensions = ".pdf,.jpg,.jpeg,.png,.webp,.docx,.xlsx,.csv";

const documentTypeOptions = [
  { value: "drawing", label: "Drawing" },
  { value: "measurement", label: "Measurement" },
  { value: "contract", label: "Contract" },
  { value: "customer_file", label: "Customer File" },
  { value: "specification", label: "Specification" },
  { value: "photo", label: "Photo" },
  { value: "installation", label: "Installation" },
  { value: "change_order", label: "Change Order" },
  { value: "other", label: "Other" },
];

const mimeByExtension: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
};

const allowedMimeTypes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "application/csv",
  "application/vnd.ms-excel",
]);

function extensionOf(name: string) {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

function normalizedMimeType(file: File) {
  const browserType = file.type.trim().toLowerCase();
  if (browserType) return browserType;
  return mimeByExtension[extensionOf(file.name)] || "";
}

function safeFileName(name: string) {
  const cleaned = name.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-");
  return cleaned || "document";
}

function documentTypeLabel(value: string) {
  return documentTypeOptions.find((option) => option.value === value)?.label || "Document";
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function validateFile(file: File) {
  const extension = extensionOf(file.name);
  if (!(extension in mimeByExtension)) return `${file.name}: unsupported file extension.`;
  if (file.size > maxFileSize) return `${file.name}: files must be 25 MiB or smaller.`;
  const mimeType = normalizedMimeType(file);
  if (!allowedMimeTypes.has(mimeType)) return `${file.name}: unsupported file type.`;
  return null;
}

export default function EntityDocumentsPanel({
  entityType,
  entityId,
  includeLinkedOrders = false,
  title = "Uploaded Documents",
}: Props) {
  const [documents, setDocuments] = useState<EntityDocument[]>([]);
  const [canUpload, setCanUpload] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [documentType, setDocumentType] = useState("other");
  const [description, setDescription] = useState("");
  const [fileInputKey, setFileInputKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [orphanCleanup, setOrphanCleanup] = useState<OrphanCleanup | null>(null);

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: listError } = await supabase.rpc("list_entity_documents", {
      p_entity_type: entityType,
      p_entity_id: entityId,
      p_include_linked_orders: includeLinkedOrders,
    });
    if (listError) setError(listError.message);
    else setDocuments((data ?? []) as EntityDocument[]);
    setLoading(false);
  }, [entityId, entityType, includeLinkedOrders]);

  useEffect(() => {
    let active = true;
    async function initialize() {
      try {
        const { profile, error: profileError } = await getCurrentProfile();
        if (!active) return;
        if (profileError) throw profileError;
        const roles = profile?.roles ?? (profile?.role ? [profile.role] : []);
        setCanUpload(roles.some((role) => ["super_admin", "admin", "sales"].includes(role)));
        await loadDocuments();
      } catch (caught) {
        if (!active) return;
        setError(caught instanceof Error ? caught.message : "Documents could not be loaded.");
        setLoading(false);
      }
    }
    void initialize();
    return () => {
      active = false;
    };
  }, [loadDocuments]);

  const selectedSummary = useMemo(() => {
    if (files.length === 0) return "PDF, images, DOCX, XLSX or CSV · max 25 MiB each";
    return `${files.length} file${files.length === 1 ? "" : "s"} selected`;
  }, [files]);

  function selectFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const nextFiles = Array.from(event.target.files ?? []);
    const validationError = nextFiles.map(validateFile).find(Boolean);
    if (validationError) {
      setFiles([]);
      setError(validationError);
      setFileInputKey((value) => value + 1);
      return;
    }
    setError(null);
    setFiles(nextFiles);
  }

  async function uploadDocuments(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canUpload || files.length === 0 || busyId || orphanCleanup) return;

    setBusyId("upload");
    setError(null);
    setMessage(null);
    let uploadedCount = 0;
    let batchError: string | null = null;

    for (const file of files) {
      const validationError = validateFile(file);
      if (validationError) {
        batchError = validationError;
        break;
      }

      const mimeType = normalizedMimeType(file);
      const storagePath = `${entityType}/${entityId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
      const { error: uploadError } = await supabase.storage.from(bucket).upload(storagePath, file, {
        contentType: mimeType,
        upsert: false,
      });
      if (uploadError) {
        batchError = `${file.name}: ${uploadError.message}`;
        break;
      }

      const { error: metadataError } = await supabase.rpc("register_entity_document", {
        p_entity_type: entityType,
        p_entity_id: entityId,
        p_file_name: file.name,
        p_storage_path: storagePath,
        p_document_type: documentType,
        p_mime_type: mimeType,
        p_file_size_bytes: file.size,
        p_description: description.trim() || null,
      });
      if (metadataError) {
        const { error: cleanupError } = await supabase.storage.from(bucket).remove([storagePath]);
        if (cleanupError) {
          setOrphanCleanup({ storagePath, fileName: file.name });
          batchError = `${file.name}: metadata registration failed (${metadataError.message}) and orphan cleanup also failed (${cleanupError.message}). Retry orphan cleanup before uploading more files.`;
        } else {
          batchError = `${file.name}: ${metadataError.message}`;
        }
        break;
      }
      uploadedCount += 1;
    }

    setFiles([]);
    setFileInputKey((value) => value + 1);
    if (uploadedCount > 0) {
      await loadDocuments();
      setMessage(
        batchError
          ? `${uploadedCount} file${uploadedCount === 1 ? "" : "s"} uploaded before the batch stopped.`
          : `${uploadedCount} file${uploadedCount === 1 ? "" : "s"} uploaded.`,
      );
      setDescription("");
    }
    if (batchError) setError(batchError);
    setBusyId(null);
  }

  async function retryOrphanCleanup() {
    if (!orphanCleanup || busyId) return;
    setBusyId("orphan-cleanup");
    setError(null);
    setMessage(null);
    const fileName = orphanCleanup.fileName;
    const { error: cleanupError } = await supabase.storage.from(bucket).remove([orphanCleanup.storagePath]);
    if (cleanupError) {
      setError(`${fileName}: orphan cleanup retry failed (${cleanupError.message}).`);
      setBusyId(null);
      return;
    }
    setOrphanCleanup(null);
    setMessage(`${fileName}: orphaned private upload was removed.`);
    setBusyId(null);
  }

  async function openDocument(item: EntityDocument, download: boolean) {
    if (busyId) return;
    setBusyId(item.id);
    setError(null);
    const { data, error: signedUrlError } = await supabase.storage
      .from(item.storage_bucket || bucket)
      .createSignedUrl(
        item.storage_path,
        signedAccessSeconds,
        download ? { download: item.file_name } : undefined,
      );
    if (signedUrlError || !data?.signedUrl) {
      setError(signedUrlError?.message || "Private document link could not be created.");
      setBusyId(null);
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    setBusyId(null);
  }

  async function deactivateDocument(item: EntityDocument) {
    if (!canUpload || busyId || !window.confirm(`Deactivate ${item.file_name}? The private file will be retained for history.`)) return;
    setBusyId(item.id);
    setError(null);
    setMessage(null);
    const { error: deactivateError } = await supabase.rpc("deactivate_entity_document", {
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
    <ComponentCard
      title={title}
      desc="Private Project and Order files. Preview/download links expire after 60 seconds; deactivation retains history."
    >
      <div className="space-y-5">
        {error ? <Alert variant="error" title="Document action failed" message={error} /> : null}
        {message ? <Alert variant="success" title="Documents updated" message={message} /> : null}

        {orphanCleanup ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border p-3">
            <FormHint>
              {orphanCleanup.fileName} was uploaded but could not be registered or removed. Resolve this private orphan before uploading more files.
            </FormHint>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busyId !== null}
              onClick={() => void retryOrphanCleanup()}
            >
              {busyId === "orphan-cleanup" ? "Cleaning up…" : "Retry orphan cleanup"}
            </Button>
          </div>
        ) : null}

        {canUpload ? (
          <form onSubmit={uploadDocuments} className="grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor={`${entityType}-document-files`}>Files</Label>
              <Input
                key={fileInputKey}
                id={`${entityType}-document-files`}
                type="file"
                accept={acceptedExtensions}
                multiple
                disabled={busyId !== null || orphanCleanup !== null}
                onChange={selectFiles}
                hint={selectedSummary}
              />
            </div>
            <div>
              <Label htmlFor={`${entityType}-document-type`}>Document type</Label>
              <Select
                id={`${entityType}-document-type`}
                options={documentTypeOptions}
                value={documentType}
                onChange={setDocumentType}
                disabled={busyId !== null || orphanCleanup !== null}
              />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor={`${entityType}-document-description`}>Description</Label>
              <Input
                id={`${entityType}-document-description`}
                value={description}
                maxLength={1000}
                disabled={busyId !== null || orphanCleanup !== null}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Optional note applied to the selected files"
              />
            </div>
            <div className="md:col-span-2 flex justify-end">
              <Button type="submit" disabled={busyId !== null || files.length === 0 || orphanCleanup !== null}>
                {busyId === "upload" ? "Uploading…" : `Upload ${files.length || ""} file${files.length === 1 ? "" : "s"}`.trim()}
              </Button>
            </div>
          </form>
        ) : (
          <FormHint>You have read-only access to these documents.</FormHint>
        )}

        {error && !loading && !orphanCleanup ? (
          <Button type="button" variant="outline" size="sm" onClick={() => void loadDocuments()} disabled={busyId !== null}>
            Retry
          </Button>
        ) : null}

        <TableViewport>
          <Table variant="admin" minWidth="wide">
            <TableHeader variant="admin">
              <TableRow>
                <TableCell isHeader variant="admin">Document</TableCell>
                <TableCell isHeader variant="admin">Type</TableCell>
                <TableCell isHeader variant="admin">Source</TableCell>
                <TableCell isHeader variant="admin">Uploaded</TableCell>
                <TableCell isHeader variant="admin">Size</TableCell>
                <TableCell isHeader variant="admin">Actions</TableCell>
              </TableRow>
            </TableHeader>
            <TableBody variant="admin">
              {loading ? <TableStateRow colSpan={6}>Loading documents…</TableStateRow> : null}
              {!loading && !error && documents.length === 0 ? <TableStateRow colSpan={6}>No uploaded documents yet.</TableStateRow> : null}
              {!loading ? documents.map((item) => (
                <TableRow key={item.id}>
                  <TableCell variant="admin">
                    <p className="font-medium">{item.file_name}</p>
                    {item.description ? <p className="text-sm">{item.description}</p> : null}
                  </TableCell>
                  <TableCell variant="admin">{documentTypeLabel(item.document_type)}</TableCell>
                  <TableCell variant="admin">
                    <Badge color={item.entity_type === "project" ? "primary" : "info"}>{item.source_label}</Badge>
                  </TableCell>
                  <TableCell variant="admin">
                    <p>{item.uploaded_by_name || "Modulex user"}</p>
                    <p className="text-sm">{formatDateTime(item.created_at)}</p>
                  </TableCell>
                  <TableCell variant="admin">{formatBytes(Number(item.file_size_bytes || 0))}</TableCell>
                  <TableCell variant="admin">
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" disabled={busyId !== null} onClick={() => void openDocument(item, false)}>Preview</Button>
                      <Button size="sm" variant="outline" disabled={busyId !== null} onClick={() => void openDocument(item, true)}>Download</Button>
                      {canUpload ? <Button size="sm" variant="danger" disabled={busyId !== null} onClick={() => void deactivateDocument(item)}>Deactivate</Button> : null}
                    </div>
                  </TableCell>
                </TableRow>
              )) : null}
            </TableBody>
          </Table>
        </TableViewport>
      </div>
    </ComponentCard>
  );
}
