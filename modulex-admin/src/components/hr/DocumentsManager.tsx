"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import StatTile from "@/components/common/StatTile";
import Label from "@/components/form/Label";
import Select from "@/components/form/Select";
import Input from "@/components/form/input/InputField";
import TextArea from "@/components/form/input/TextArea";
import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { Table, TableBody, TableCell, TableHeader, TableRow, TableStateRow, TableViewport } from "@/components/ui/table";
import { ADMIN_TEXT_STYLES } from "@/components/ui/theme/adminTheme";
import { supabase } from "@/lib/supabase/client";

type Employee = { id: string; employee_number: string; first_name: string; last_name: string };
type HrDocument = { id: string; employee_id: string; document_type: string; title: string; storage_path: string | null; file_name: string | null; mime_type: string | null; file_size: number | null; document_number: string | null; issued_on: string | null; expires_on: string | null; status: string; is_confidential: boolean; notes: string | null; created_at: string };
type Notice = { variant: "success" | "error"; title: string; message: string };

const types = ["employment_contract", "w4", "i9", "id", "work_authorization", "certification", "license", "policy_acknowledgment", "performance", "medical", "other"];
function safeName(value: string) { return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-"); }
function bytes(value: number | null) { if (!value) return "—"; if (value < 1024) return `${value} B`; if (value < 1048576) return `${(value / 1024).toFixed(1)} KB`; return `${(value / 1048576).toFixed(1)} MB`; }
function labelize(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function formatDate(value: string | null) { if (!value) return "—"; const [year, month, day] = value.split("-"); return year && month && day ? `${day}.${month}.${year}` : value; }

export default function DocumentsManager() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [documents, setDocuments] = useState<HrDocument[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [type, setType] = useState("employment_contract");
  const [title, setTitle] = useState("");
  const [documentNumber, setDocumentNumber] = useState("");
  const [issuedOn, setIssuedOn] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  function fail(titleText: string, message: string, error: unknown) { console.error(titleText, error); setNotice({ variant: "error", title: titleText, message }); }

  async function load() {
    setLoading(true);
    try {
      const [e, d] = await Promise.all([
        supabase.from("hr_employees").select("id,employee_number,first_name,last_name").order("last_name"),
        supabase.from("hr_documents").select("id,employee_id,document_type,title,storage_path,file_name,mime_type,file_size,document_number,issued_on,expires_on,status,is_confidential,notes,created_at").order("created_at", { ascending: false }).limit(500),
      ]);
      if (e.error) throw e.error; if (d.error) throw d.error;
      const nextEmployees = (e.data ?? []) as Employee[];
      setEmployees(nextEmployees); setDocuments((d.data ?? []) as HrDocument[]);
      if (!employeeId && nextEmployees[0]) setEmployeeId(nextEmployees[0].id);
    } catch (error) { fail("Documents unavailable", "Employee documents could not be loaded. Please try again.", error); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function upload(event: FormEvent) {
    event.preventDefault(); if (!employeeId || !file) return; setBusy("upload"); setNotice(null);
    const path = `${employeeId}/${crypto.randomUUID()}-${safeName(file.name)}`;
    const uploadResult = await supabase.storage.from("hr-documents").upload(path, file, { contentType: file.type || undefined, upsert: false });
    if (uploadResult.error) { fail("Upload failed", "The document file could not be uploaded. Please try again.", uploadResult.error); setBusy(null); return; }
    const { error } = await supabase.from("hr_documents").insert({ employee_id: employeeId, document_type: type, title: title.trim() || file.name, storage_path: path, file_name: file.name, mime_type: file.type || null, file_size: file.size, document_number: documentNumber.trim() || null, issued_on: issuedOn || null, expires_on: expiresOn || null, status: "active", is_confidential: true, notes: notes.trim() || null });
    if (error) {
      const rollback = await supabase.storage.from("hr-documents").remove([path]);
      if (rollback.error) console.error("Document upload rollback failed", rollback.error);
      fail("Document not recorded", "The uploaded file could not be attached to the employee record. Please try again.", error); setBusy(null); return;
    }
    setFile(null); setTitle(""); setDocumentNumber(""); setIssuedOn(""); setExpiresOn(""); setNotes("");
    const inputElement = document.getElementById("hr-document-file") as HTMLInputElement | null; if (inputElement) inputElement.value = "";
    setNotice({ variant: "success", title: "Document uploaded", message: "The private employee document was stored securely." }); await load(); setBusy(null);
  }

  async function openDocument(row: HrDocument) {
    if (!row.storage_path) return; setBusy(`open-${row.id}`); setNotice(null);
    const { data, error } = await supabase.storage.from("hr-documents").createSignedUrl(row.storage_path, 60);
    if (error) fail("Document not opened", "A secure preview link could not be created. Please try again.", error);
    else window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    setBusy(null);
  }

  async function remove(row: HrDocument) {
    setBusy(row.id); setNotice(null);
    if (row.storage_path) {
      const storageResult = await supabase.storage.from("hr-documents").remove([row.storage_path]);
      if (storageResult.error) { fail("Document not deleted", "The private file could not be removed. No database record was deleted.", storageResult.error); setBusy(null); return; }
    }
    const { error } = await supabase.from("hr_documents").delete().eq("id", row.id);
    if (error) fail("Document record not deleted", "The document record could not be removed. Please try again.", error);
    else { setDeleteCandidateId(null); setNotice({ variant: "success", title: "Document deleted", message: "The employee document was removed." }); await load(); }
    setBusy(null);
  }

  const employeeOptions = employees.map((employee) => ({ value: employee.id, label: `${employee.employee_number} · ${employee.first_name} ${employee.last_name}` }));
  const employeeMap = useMemo(() => new Map(employees.map((employee) => [employee.id, `${employee.employee_number} · ${employee.first_name} ${employee.last_name}`])), [employees]);
  const filtered = employeeId ? documents.filter((document) => document.employee_id === employeeId) : documents;
  const today = new Date(); const soon = new Date(); soon.setDate(today.getDate() + 60);
  const expiring = documents.filter((document) => document.expires_on && new Date(`${document.expires_on}T00:00:00`) >= today && new Date(`${document.expires_on}T00:00:00`) <= soon).length;
  const expired = documents.filter((document) => document.expires_on && new Date(`${document.expires_on}T00:00:00`) < today && document.status === "active").length;

  return <div className="space-y-6">
    {notice ? <Alert variant={notice.variant} title={notice.title} message={notice.message} /> : null}
    <div className="grid gap-4 sm:grid-cols-3"><StatTile label="Documents" value={loading ? "—" : documents.length} /><StatTile label="Expiring in 60 days" value={loading ? "—" : expiring} tone={expiring > 0 ? "warning" : "neutral"} /><StatTile label="Expired" value={loading ? "—" : expired} tone={expired > 0 ? "warning" : "neutral"} /></div>
    <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
      <form onSubmit={upload}><ComponentCard title="Upload Document" desc="Files are stored in the private HR documents bucket.">
        <div><Label htmlFor="document-employee">Employee</Label><Select id="document-employee" options={employeeOptions} value={employeeId} onChange={(value) => { setEmployeeId(value); setDeleteCandidateId(null); }} required placeholder="Select employee" /></div>
        <div><Label htmlFor="document-type">Document type</Label><Select id="document-type" options={types.map((value) => ({ value, label: labelize(value) }))} value={type} onChange={setType} /></div>
        <div><Label htmlFor="document-title">Document title</Label><Input id="document-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Defaults to file name" /></div>
        <div><Label htmlFor="document-number">Document / license number</Label><Input id="document-number" value={documentNumber} onChange={(event) => setDocumentNumber(event.target.value)} placeholder="Optional" /></div>
        <div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="document-issued">Issued</Label><Input id="document-issued" type="date" value={issuedOn} onChange={(event) => setIssuedOn(event.target.value)} /></div><div><Label htmlFor="document-expires">Expires</Label><Input id="document-expires" type="date" value={expiresOn} onChange={(event) => setExpiresOn(event.target.value)} /></div></div>
        <div><Label htmlFor="hr-document-file">File</Label><input id="hr-document-file" type="file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} required className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300" /></div>
        <div><Label htmlFor="document-notes">Notes</Label><TextArea id="document-notes" rows={4} value={notes} onChange={setNotes} placeholder="Optional document notes" /></div>
        <p className={`${ADMIN_TEXT_STYLES.muted} text-xs`}>Private bucket · PDF, images, TXT and Word documents. Existing server/storage limits remain unchanged.</p>
        <Button type="submit" className="w-full" disabled={busy !== null || !employeeId || !file}>{busy === "upload" ? "Uploading…" : "Upload Securely"}</Button>
      </ComponentCard></form>
      <ComponentCard title="Employee Documents" desc="Filter, open through short-lived signed URLs, or remove private employee files.">
        <div><Label htmlFor="document-filter">Employee filter</Label><Select id="document-filter" options={employeeOptions} value={employeeId} onChange={(value) => { setEmployeeId(value); setDeleteCandidateId(null); }} allowEmpty placeholder="All employees" /></div>
        <TableViewport><Table variant="admin" minWidth="extraWide"><TableHeader variant="admin"><TableRow><TableCell isHeader variant="admin">Document</TableCell><TableCell isHeader variant="admin">Type</TableCell><TableCell isHeader variant="admin">Employee</TableCell><TableCell isHeader variant="admin">Expires</TableCell><TableCell isHeader variant="admin" className="text-right">Size</TableCell><TableCell isHeader variant="admin">Status</TableCell><TableCell isHeader variant="admin">Actions</TableCell></TableRow></TableHeader><TableBody variant="admin" aria-busy={loading}>
          {loading ? <TableStateRow colSpan={7}>Loading documents…</TableStateRow> : filtered.length === 0 ? <TableStateRow colSpan={7}>No documents found.</TableStateRow> : filtered.map((document) => <TableRow key={document.id}><TableCell variant="admin"><Button size="sm" variant="outline" onClick={() => void openDocument(document)} disabled={!document.storage_path || busy !== null}>{busy === `open-${document.id}` ? "Opening…" : document.title}</Button><p className={`${ADMIN_TEXT_STYLES.muted} mt-1 text-xs`}>{document.file_name || "Metadata only"}</p></TableCell><TableCell variant="admin">{labelize(document.document_type)}</TableCell><TableCell variant="admin">{employeeMap.get(document.employee_id) || "Unknown employee"}</TableCell><TableCell variant="admin" className="whitespace-nowrap">{formatDate(document.expires_on)}</TableCell><TableCell variant="admin" className="text-right tabular-nums">{bytes(document.file_size)}</TableCell><TableCell variant="admin"><Badge color={document.status === "active" ? "success" : "light"}>{labelize(document.status)}</Badge></TableCell><TableCell variant="admin">{deleteCandidateId === document.id ? <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => setDeleteCandidateId(null)} disabled={busy === document.id}>Cancel</Button><Button size="sm" onClick={() => void remove(document)} disabled={busy === document.id}>{busy === document.id ? "Deleting…" : "Confirm delete"}</Button></div> : <Button size="sm" variant="outline" onClick={() => setDeleteCandidateId(document.id)} disabled={busy !== null}>Delete</Button>}</TableCell></TableRow>)}
        </TableBody></Table></TableViewport>
      </ComponentCard>
    </div>
  </div>;
}
