"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import ComponentCard from "@/components/common/ComponentCard";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import Select from "@/components/form/Select";
import TextArea from "@/components/form/input/TextArea";
import { Table, TableBody, TableCell, TableHeader, TableRow, TableStateRow, TableViewport } from "@/components/ui/table";
import { hasPermission } from "@/lib/auth/permissions";
import { getCurrentProfile } from "@/lib/supabase/profile";
import {
  createVendor,
  getVendorDetail,
  getVendorSourceCandidates,
  getVendorsPage,
  mapVendorSourceIdentity,
  setVendorStatus,
  updateVendor,
  upsertVendorComplianceDocument,
  upsertVendorContact,
  type VendorComplianceState,
  type VendorComplianceStatus,
  type VendorComplianceType,
  type VendorContactType,
  type VendorDetail,
  type VendorInput,
  type VendorListItem,
  type VendorSourceCandidate,
  type VendorStatus,
  type VendorType,
} from "@/lib/finance/vendors";

const statusOptions = [
  { value: "onboarding", label: "Onboarding" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];
const vendorTypeOptions = [
  { value: "supplier", label: "Supplier" },
  { value: "contractor", label: "Contractor" },
  { value: "service_provider", label: "Service Provider" },
  { value: "other", label: "Other" },
];
const contactTypeOptions = [
  { value: "primary", label: "Primary" },
  { value: "orders", label: "Orders" },
  { value: "billing", label: "Billing" },
  { value: "remittance", label: "Remittance" },
  { value: "compliance", label: "Compliance" },
  { value: "other", label: "Other" },
];
const complianceTypeOptions = [
  { value: "w9", label: "W-9" },
  { value: "coi", label: "COI" },
  { value: "license", label: "License" },
  { value: "other", label: "Other" },
];
const complianceStatusOptions = [
  { value: "pending", label: "Pending" },
  { value: "valid", label: "Valid" },
  { value: "expired", label: "Expired" },
  { value: "rejected", label: "Rejected" },
  { value: "not_required", label: "Not Required" },
];

function statusColor(status: VendorStatus) {
  if (status === "active") return "success" as const;
  if (status === "inactive") return "error" as const;
  return "warning" as const;
}

function complianceColor(status: VendorComplianceState) {
  if (status === "valid" || status === "not_required") return "success" as const;
  if (status === "missing" || status === "expired" || status === "rejected") return "error" as const;
  return "warning" as const;
}

function complianceLabel(status: VendorComplianceState) {
  return status.replaceAll("_", " ").replace(/\b\w/g, (value) => value.toUpperCase());
}

const emptyVendorForm = {
  code: "",
  legalName: "",
  displayName: "",
  vendorType: "supplier" as VendorType,
  defaultCurrencyCode: "USD",
  remitToName: "",
  remitAddressLine1: "",
  remitAddressLine2: "",
  remitCity: "",
  remitStateRegion: "",
  remitPostalCode: "",
  remitCountryCode: "US",
  notes: "",
};

export default function FinanceVendorsManager() {
  const [vendors, setVendors] = useState<VendorListItem[]>([]);
  const [sources, setSources] = useState<VendorSourceCandidate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<VendorDetail | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ variant: "success" | "error"; text: string } | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [offset, setOffset] = useState(0);
  const pageSize = 50;

  const [editingVendor, setEditingVendor] = useState(false);
  const [vendorForm, setVendorForm] = useState(emptyVendorForm);

  const [contactType, setContactType] = useState<VendorContactType>("primary");
  const [contactName, setContactName] = useState("");
  const [contactTitle, setContactTitle] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactPrimary, setContactPrimary] = useState(true);

  const [sourceChoice, setSourceChoice] = useState("");
  const [sourcePrimary, setSourcePrimary] = useState(false);

  const [complianceType, setComplianceType] = useState<VendorComplianceType>("w9");
  const [complianceStatus, setComplianceStatusValue] = useState<VendorComplianceStatus>("pending");
  const [complianceTitle, setComplianceTitle] = useState("W-9");
  const [complianceNumber, setComplianceNumber] = useState("");
  const [issuedOn, setIssuedOn] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const [storageBucket, setStorageBucket] = useState("");
  const [storagePath, setStoragePath] = useState("");
  const [fileName, setFileName] = useState("");
  const [complianceNotes, setComplianceNotes] = useState("");

  async function load(nextOffset = offset) {
    setLoading(true);
    try {
      const profileResult = await getCurrentProfile();
      const [nextVendors, nextSources] = await Promise.all([
        getVendorsPage({
          limit: pageSize,
          offset: nextOffset,
          status: (statusFilter || null) as VendorStatus | null,
          search,
        }),
        getVendorSourceCandidates(),
      ]);
      setCanManage(hasPermission(profileResult.profile?.roles, "finance.manage"));
      setVendors(nextVendors);
      setSources(nextSources);
      setOffset(nextOffset);
    } finally {
      setLoading(false);
    }
  }

  async function loadDetail(vendorId: string) {
    setDetailLoading(true);
    try {
      const nextDetail = await getVendorDetail(vendorId);
      setDetail(nextDetail);
      setSelectedId(vendorId);
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    void load(0).catch((error) => {
      setMessage({ variant: "error", text: error instanceof Error ? error.message : "Vendors could not be loaded." });
    });
    // Initial route load only; filters refresh explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalCount = Number(vendors[0]?.total_count ?? 0);
  const sourceOptions = useMemo(
    () => sources.map((source) => ({
      value: `${source.source_system}|${source.source_code}`,
      label: `${source.source_system.replaceAll("_", " ")} · ${source.source_code}${source.source_name_snapshot ? ` · ${source.source_name_snapshot}` : ""}${source.mapped_vendor_name ? ` → ${source.mapped_vendor_name}` : ""}`,
    })),
    [sources],
  );

  function resetVendorForm() {
    setVendorForm(emptyVendorForm);
    setEditingVendor(false);
  }

  function startVendorEdit() {
    if (!detail) return;
    const vendor = detail.vendor;
    setVendorForm({
      code: vendor.code,
      legalName: vendor.legal_name,
      displayName: vendor.display_name,
      vendorType: vendor.vendor_type,
      defaultCurrencyCode: vendor.default_currency_code ?? "USD",
      remitToName: vendor.remit_to_name ?? "",
      remitAddressLine1: vendor.remit_address_line1 ?? "",
      remitAddressLine2: vendor.remit_address_line2 ?? "",
      remitCity: vendor.remit_city ?? "",
      remitStateRegion: vendor.remit_state_region ?? "",
      remitPostalCode: vendor.remit_postal_code ?? "",
      remitCountryCode: vendor.remit_country_code ?? "US",
      notes: vendor.notes ?? "",
    });
    setEditingVendor(true);
  }

  function vendorInput(): VendorInput | null {
    if (!vendorForm.code.trim() || !vendorForm.legalName.trim() || !vendorForm.displayName.trim()) {
      setMessage({ variant: "error", text: "Vendor code, legal name and display name are required." });
      return null;
    }
    if (vendorForm.defaultCurrencyCode.trim() && vendorForm.defaultCurrencyCode.trim().length !== 3) {
      setMessage({ variant: "error", text: "Default currency must be a 3-letter code." });
      return null;
    }
    if (vendorForm.remitCountryCode.trim() && vendorForm.remitCountryCode.trim().length !== 2) {
      setMessage({ variant: "error", text: "Remittance country must be a 2-letter code." });
      return null;
    }
    return {
      code: vendorForm.code,
      legalName: vendorForm.legalName,
      displayName: vendorForm.displayName,
      vendorType: vendorForm.vendorType,
      defaultCurrencyCode: vendorForm.defaultCurrencyCode,
      remitToName: vendorForm.remitToName,
      remitAddressLine1: vendorForm.remitAddressLine1,
      remitAddressLine2: vendorForm.remitAddressLine2,
      remitCity: vendorForm.remitCity,
      remitStateRegion: vendorForm.remitStateRegion,
      remitPostalCode: vendorForm.remitPostalCode,
      remitCountryCode: vendorForm.remitCountryCode,
      notes: vendorForm.notes,
    };
  }

  async function submitVendor(event: FormEvent) {
    event.preventDefault();
    if (!canManage || busy) return;
    const input = vendorInput();
    if (!input) return;
    setBusy(true);
    try {
      let vendorId = selectedId;
      if (editingVendor && selectedId) {
        await updateVendor(selectedId, input);
        setMessage({ variant: "success", text: "Vendor master updated." });
      } else {
        vendorId = await createVendor(input);
        setMessage({ variant: "success", text: "Vendor created in onboarding status. Source identities remain unmapped until explicitly linked." });
      }
      resetVendorForm();
      await load(0);
      if (vendorId) await loadDetail(vendorId);
    } catch (error) {
      setMessage({ variant: "error", text: error instanceof Error ? error.message : "Vendor could not be saved." });
    } finally {
      setBusy(false);
    }
  }

  async function changeVendorStatus(status: VendorStatus) {
    if (!canManage || !selectedId || busy) return;
    setBusy(true);
    try {
      await setVendorStatus(selectedId, status);
      setMessage({ variant: "success", text: `Vendor status changed to ${status}. Historical references remain intact.` });
      await Promise.all([load(offset), loadDetail(selectedId)]);
    } catch (error) {
      setMessage({ variant: "error", text: error instanceof Error ? error.message : "Vendor status could not be changed." });
    } finally {
      setBusy(false);
    }
  }

  async function submitContact(event: FormEvent) {
    event.preventDefault();
    if (!canManage || !selectedId || busy) return;
    if (!contactName.trim() || (!contactEmail.trim() && !contactPhone.trim())) {
      setMessage({ variant: "error", text: "Contact name and at least one email or phone are required." });
      return;
    }
    setBusy(true);
    try {
      await upsertVendorContact({
        vendorId: selectedId,
        contactType,
        name: contactName,
        title: contactTitle,
        email: contactEmail,
        phone: contactPhone,
        isPrimary: contactPrimary,
      });
      setContactName("");
      setContactTitle("");
      setContactEmail("");
      setContactPhone("");
      setContactPrimary(false);
      setMessage({ variant: "success", text: "Vendor contact saved." });
      await Promise.all([load(offset), loadDetail(selectedId)]);
    } catch (error) {
      setMessage({ variant: "error", text: error instanceof Error ? error.message : "Vendor contact could not be saved." });
    } finally {
      setBusy(false);
    }
  }

  async function submitSource(event: FormEvent) {
    event.preventDefault();
    if (!canManage || !selectedId || !sourceChoice || busy) return;
    const separator = sourceChoice.indexOf("|");
    if (separator < 1) return;
    const sourceSystem = sourceChoice.slice(0, separator) as VendorSourceCandidate["source_system"];
    const sourceCode = sourceChoice.slice(separator + 1);
    const candidate = sources.find((item) => item.source_system === sourceSystem && item.source_code === sourceCode);
    if (candidate?.mapped_vendor_id && candidate.mapped_vendor_id !== selectedId) {
      setMessage({ variant: "error", text: "That source identity is already mapped to another canonical vendor." });
      return;
    }
    setBusy(true);
    try {
      await mapVendorSourceIdentity({
        vendorId: selectedId,
        sourceSystem,
        sourceCode,
        sourceNameSnapshot: candidate?.source_name_snapshot,
        isPrimary: sourcePrimary,
      });
      setSourceChoice("");
      setSourcePrimary(false);
      setMessage({ variant: "success", text: "Source identity mapped. Legacy vendor code/name snapshots were preserved." });
      await Promise.all([load(offset), loadDetail(selectedId)]);
    } catch (error) {
      setMessage({ variant: "error", text: error instanceof Error ? error.message : "Vendor source could not be mapped." });
    } finally {
      setBusy(false);
    }
  }

  async function submitCompliance(event: FormEvent) {
    event.preventDefault();
    if (!canManage || !selectedId || busy) return;
    if (!complianceTitle.trim()) {
      setMessage({ variant: "error", text: "Compliance document title is required." });
      return;
    }
    if ((storageBucket.trim() && !storagePath.trim()) || (!storageBucket.trim() && storagePath.trim())) {
      setMessage({ variant: "error", text: "Storage bucket and storage path must be supplied together." });
      return;
    }
    setBusy(true);
    try {
      await upsertVendorComplianceDocument({
        vendorId: selectedId,
        documentType: complianceType,
        status: complianceStatus,
        title: complianceTitle,
        documentNumber: complianceNumber,
        issuedOn,
        expiresOn,
        storageBucket,
        storagePath,
        fileName,
        notes: complianceNotes,
      });
      setComplianceNumber("");
      setIssuedOn("");
      setExpiresOn("");
      setStorageBucket("");
      setStoragePath("");
      setFileName("");
      setComplianceNotes("");
      setMessage({ variant: "success", text: "Compliance metadata saved. Missing/expired compliance remains a warning and does not block payment." });
      await Promise.all([load(offset), loadDetail(selectedId)]);
    } catch (error) {
      setMessage({ variant: "error", text: error instanceof Error ? error.message : "Compliance metadata could not be saved." });
    } finally {
      setBusy(false);
    }
  }

  function chooseComplianceType(value: string) {
    const next = value as VendorComplianceType;
    setComplianceType(next);
    setComplianceTitle(next === "w9" ? "W-9" : next === "coi" ? "COI" : next === "license" ? "License" : "Other Compliance Document");
  }

  const selectedWarning = detail && [detail.compliance_summary.w9, detail.compliance_summary.coi].some((state) => state === "missing" || state === "expired");

  return (
    <div className="space-y-6">
      {message ? <Alert variant={message.variant} title={message.variant === "success" ? "Vendor saved" : "Vendor error"} message={message.text} /> : null}
      {!canManage && !loading ? <Alert variant="info" title="Read-only Finance access" message="Your role can review Vendors, Contacts, Source identities and Compliance but cannot mutate vendor-master data." /> : null}

      {canManage ? (
        <ComponentCard title={editingVendor ? "Edit Canonical Vendor" : "New Canonical Vendor"} desc="Create the AP counterparty explicitly. Vendor Catalog source codes are not promoted automatically.">
          <form onSubmit={submitVendor} className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div><Label htmlFor="vendor-code">Vendor code</Label><Input id="vendor-code" value={vendorForm.code} onChange={(event) => setVendorForm((current) => ({ ...current, code: event.target.value }))} required /></div>
              <div><Label htmlFor="vendor-legal-name">Legal name</Label><Input id="vendor-legal-name" value={vendorForm.legalName} onChange={(event) => setVendorForm((current) => ({ ...current, legalName: event.target.value }))} required /></div>
              <div><Label htmlFor="vendor-display-name">Display name</Label><Input id="vendor-display-name" value={vendorForm.displayName} onChange={(event) => setVendorForm((current) => ({ ...current, displayName: event.target.value }))} required /></div>
              <div><Label htmlFor="vendor-type">Vendor type</Label><Select id="vendor-type" options={vendorTypeOptions} value={vendorForm.vendorType} onChange={(value) => setVendorForm((current) => ({ ...current, vendorType: value as VendorType }))} /></div>
              <div><Label htmlFor="vendor-currency">Default currency</Label><Input id="vendor-currency" maxLength={3} value={vendorForm.defaultCurrencyCode} onChange={(event) => setVendorForm((current) => ({ ...current, defaultCurrencyCode: event.target.value.toUpperCase() }))} /></div>
              <div><Label htmlFor="vendor-remit-name">Remit to</Label><Input id="vendor-remit-name" value={vendorForm.remitToName} onChange={(event) => setVendorForm((current) => ({ ...current, remitToName: event.target.value }))} /></div>
              <div><Label htmlFor="vendor-remit-address">Remittance address</Label><Input id="vendor-remit-address" value={vendorForm.remitAddressLine1} onChange={(event) => setVendorForm((current) => ({ ...current, remitAddressLine1: event.target.value }))} /></div>
              <div><Label htmlFor="vendor-remit-address2">Address line 2</Label><Input id="vendor-remit-address2" value={vendorForm.remitAddressLine2} onChange={(event) => setVendorForm((current) => ({ ...current, remitAddressLine2: event.target.value }))} /></div>
              <div><Label htmlFor="vendor-remit-city">City</Label><Input id="vendor-remit-city" value={vendorForm.remitCity} onChange={(event) => setVendorForm((current) => ({ ...current, remitCity: event.target.value }))} /></div>
              <div><Label htmlFor="vendor-remit-state">State / region</Label><Input id="vendor-remit-state" value={vendorForm.remitStateRegion} onChange={(event) => setVendorForm((current) => ({ ...current, remitStateRegion: event.target.value }))} /></div>
              <div><Label htmlFor="vendor-remit-postal">Postal code</Label><Input id="vendor-remit-postal" value={vendorForm.remitPostalCode} onChange={(event) => setVendorForm((current) => ({ ...current, remitPostalCode: event.target.value }))} /></div>
              <div><Label htmlFor="vendor-remit-country">Country</Label><Input id="vendor-remit-country" maxLength={2} value={vendorForm.remitCountryCode} onChange={(event) => setVendorForm((current) => ({ ...current, remitCountryCode: event.target.value.toUpperCase() }))} /></div>
            </div>
            <div><Label htmlFor="vendor-notes">Notes</Label><TextArea id="vendor-notes" value={vendorForm.notes} onChange={(value) => setVendorForm((current) => ({ ...current, notes: value }))} rows={3} /></div>
            <div className="flex flex-wrap gap-3"><Button type="submit" disabled={busy}>{editingVendor ? "Update Vendor" : "Create Vendor"}</Button>{editingVendor ? <Button variant="outline" disabled={busy} onClick={resetVendorForm}>Cancel Edit</Button> : null}</div>
          </form>
        </ComponentCard>
      ) : null}

      <ComponentCard title="Vendor Overview" desc="One canonical AP identity; inactive vendors remain readable for historical procurement, invoice and Finance references.">
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div><Label htmlFor="vendor-filter-status">Status</Label><Select id="vendor-filter-status" options={statusOptions} value={statusFilter} onChange={setStatusFilter} placeholder="All statuses" /></div>
            <div className="md:col-span-2"><Label htmlFor="vendor-search">Search</Label><Input id="vendor-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Code, legal name or display name" /></div>
          </div>
          <div className="flex flex-wrap gap-3"><Button variant="outline" onClick={() => void load(0)} disabled={loading}>Apply Filters</Button><Button variant="outline" onClick={() => { setSearch(""); setStatusFilter(""); void load(0); }} disabled={loading}>Reset</Button></div>
          <TableViewport>
            <Table>
              <TableHeader><TableRow><TableCell isHeader>Vendor</TableCell><TableCell isHeader>Type</TableCell><TableCell isHeader>Status</TableCell><TableCell isHeader>Compliance</TableCell><TableCell isHeader>Sources</TableCell><TableCell isHeader>Action</TableCell></TableRow></TableHeader>
              <TableBody>
                {loading ? <TableStateRow colSpan={6}>Loading vendors…</TableStateRow> : vendors.length === 0 ? <TableStateRow colSpan={6}>No canonical vendors match these filters.</TableStateRow> : vendors.map((vendor) => (
                  <TableRow key={vendor.id}>
                    <TableCell><div className="font-medium text-gray-800 dark:text-white/90">{vendor.display_name}</div><div className="text-xs text-gray-500 dark:text-gray-400">{vendor.code} · {vendor.legal_name}</div></TableCell>
                    <TableCell>{vendor.vendor_type.replaceAll("_", " ")}</TableCell>
                    <TableCell><Badge color={statusColor(vendor.status)}>{vendor.status}</Badge></TableCell>
                    <TableCell><div className="flex flex-wrap gap-2"><Badge color={complianceColor(vendor.w9_status)}>W-9 {complianceLabel(vendor.w9_status)}</Badge><Badge color={complianceColor(vendor.coi_status)}>COI {complianceLabel(vendor.coi_status)}</Badge></div></TableCell>
                    <TableCell>{vendor.source_identity_count}</TableCell>
                    <TableCell><Button size="sm" variant="outline" onClick={() => void loadDetail(vendor.id)} disabled={detailLoading}>Open</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableViewport>
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-gray-500 dark:text-gray-400"><span>{totalCount} vendor{totalCount === 1 ? "" : "s"}</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={loading || offset === 0} onClick={() => void load(Math.max(0, offset - pageSize))}>Previous</Button><Button size="sm" variant="outline" disabled={loading || offset + pageSize >= totalCount} onClick={() => void load(offset + pageSize)}>Next</Button></div></div>
        </div>
      </ComponentCard>

      {detailLoading ? <ComponentCard title="Vendor Detail"><div className="text-sm text-gray-500 dark:text-gray-400">Loading vendor detail…</div></ComponentCard> : detail ? (
        <>
          {selectedWarning ? <Alert variant="warning" title="Compliance warning" message="W-9 or COI is missing/expired. This is a review warning only; F3A does not create a hard payment block." /> : null}
          <ComponentCard title={`${detail.vendor.display_name} · Vendor Detail`} desc="Canonical business identity, remittance profile and lifecycle.">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 text-sm">
              <div><span className="text-gray-500 dark:text-gray-400">Code</span><div className="font-medium text-gray-800 dark:text-white/90">{detail.vendor.code}</div></div>
              <div><span className="text-gray-500 dark:text-gray-400">Legal name</span><div className="font-medium text-gray-800 dark:text-white/90">{detail.vendor.legal_name}</div></div>
              <div><span className="text-gray-500 dark:text-gray-400">Status</span><div><Badge color={statusColor(detail.vendor.status)}>{detail.vendor.status}</Badge></div></div>
              <div><span className="text-gray-500 dark:text-gray-400">Currency</span><div className="font-medium text-gray-800 dark:text-white/90">{detail.vendor.default_currency_code ?? "Not set"}</div></div>
            </div>
            {canManage ? <div className="mt-5 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={startVendorEdit} disabled={busy}>Edit Vendor</Button>{detail.vendor.status !== "active" ? <Button size="sm" onClick={() => void changeVendorStatus("active")} disabled={busy}>Activate</Button> : null}{detail.vendor.status !== "inactive" ? <Button size="sm" variant="outline" onClick={() => void changeVendorStatus("inactive")} disabled={busy}>Deactivate</Button> : null}</div> : null}
          </ComponentCard>

          <ComponentCard title="Contacts" desc="Primary, ordering, billing, remittance and compliance contacts belong to the canonical vendor.">
            {canManage ? <form onSubmit={submitContact} className="mb-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4"><div><Label htmlFor="vendor-contact-type">Type</Label><Select id="vendor-contact-type" options={contactTypeOptions} value={contactType} onChange={(value) => setContactType(value as VendorContactType)} /></div><div><Label htmlFor="vendor-contact-name">Name</Label><Input id="vendor-contact-name" value={contactName} onChange={(event) => setContactName(event.target.value)} required /></div><div><Label htmlFor="vendor-contact-title">Title</Label><Input id="vendor-contact-title" value={contactTitle} onChange={(event) => setContactTitle(event.target.value)} /></div><div><Label htmlFor="vendor-contact-email">Email</Label><Input id="vendor-contact-email" type="email" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} /></div><div><Label htmlFor="vendor-contact-phone">Phone</Label><Input id="vendor-contact-phone" value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} /></div><div className="flex items-end gap-2"><input id="vendor-contact-primary" type="checkbox" checked={contactPrimary} onChange={(event) => setContactPrimary(event.target.checked)} className="h-4 w-4" /><Label htmlFor="vendor-contact-primary">Primary contact</Label></div><div className="flex items-end"><Button type="submit" disabled={busy}>Add Contact</Button></div></form> : null}
            <TableViewport><Table><TableHeader><TableRow><TableCell isHeader>Name</TableCell><TableCell isHeader>Type</TableCell><TableCell isHeader>Email</TableCell><TableCell isHeader>Phone</TableCell><TableCell isHeader>Primary</TableCell></TableRow></TableHeader><TableBody>{detail.contacts.length === 0 ? <TableStateRow colSpan={5}>No vendor contacts recorded.</TableStateRow> : detail.contacts.map((contact) => <TableRow key={contact.id}><TableCell>{contact.name}{contact.title ? <div className="text-xs text-gray-500 dark:text-gray-400">{contact.title}</div> : null}</TableCell><TableCell>{contact.contact_type}</TableCell><TableCell>{contact.email ?? "—"}</TableCell><TableCell>{contact.phone ?? "—"}</TableCell><TableCell>{contact.is_primary ? "Yes" : "No"}</TableCell></TableRow>)}</TableBody></Table></TableViewport>
          </ComponentCard>

          <ComponentCard title="Source Identities" desc="Source mapping is explicit. Vendor Catalog codes stay integration identities until linked here.">
            {canManage ? <form onSubmit={submitSource} className="mb-5 grid gap-4 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-end"><div><Label htmlFor="vendor-source">Source candidate</Label><Select id="vendor-source" options={sourceOptions} value={sourceChoice} onChange={setSourceChoice} placeholder="Choose a catalog/procurement/invoice source" /></div><div className="flex items-center gap-2 pb-2"><input id="vendor-source-primary" type="checkbox" checked={sourcePrimary} onChange={(event) => setSourcePrimary(event.target.checked)} className="h-4 w-4" /><Label htmlFor="vendor-source-primary">Primary Source</Label></div><Button type="submit" disabled={busy || !sourceChoice}>Map Source</Button></form> : null}
            <TableViewport><Table><TableHeader><TableRow><TableCell isHeader>Source</TableCell><TableCell isHeader>Code</TableCell><TableCell isHeader>Name snapshot</TableCell><TableCell isHeader>Primary</TableCell></TableRow></TableHeader><TableBody>{detail.source_identities.length === 0 ? <TableStateRow colSpan={4}>No source identities mapped.</TableStateRow> : detail.source_identities.map((source) => <TableRow key={source.id}><TableCell>{source.source_system.replaceAll("_", " ")}</TableCell><TableCell>{source.source_code}</TableCell><TableCell>{source.source_name_snapshot ?? "—"}</TableCell><TableCell>{source.is_primary ? "Yes" : "No"}</TableCell></TableRow>)}</TableBody></Table></TableViewport>
          </ComponentCard>

          <ComponentCard title="Documents / Compliance" desc="Track W-9, COI, License and Other records with issue/expiry/verification metadata. Missing or expired records warn; they do not block payment.">
            <div className="mb-5 flex flex-wrap gap-2"><Badge color={complianceColor(detail.compliance_summary.w9)}>W-9 {complianceLabel(detail.compliance_summary.w9)}</Badge><Badge color={complianceColor(detail.compliance_summary.coi)}>COI {complianceLabel(detail.compliance_summary.coi)}</Badge></div>
            {canManage ? <form onSubmit={submitCompliance} className="mb-5 space-y-4"><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><div><Label htmlFor="vendor-compliance-type">Document type</Label><Select id="vendor-compliance-type" options={complianceTypeOptions} value={complianceType} onChange={chooseComplianceType} /></div><div><Label htmlFor="vendor-compliance-status">Status</Label><Select id="vendor-compliance-status" options={complianceStatusOptions} value={complianceStatus} onChange={(value) => setComplianceStatusValue(value as VendorComplianceStatus)} /></div><div><Label htmlFor="vendor-compliance-title">Title</Label><Input id="vendor-compliance-title" value={complianceTitle} onChange={(event) => setComplianceTitle(event.target.value)} required /></div><div><Label htmlFor="vendor-compliance-number">Document number</Label><Input id="vendor-compliance-number" value={complianceNumber} onChange={(event) => setComplianceNumber(event.target.value)} /></div><div><Label htmlFor="vendor-compliance-issued">Issued on</Label><Input id="vendor-compliance-issued" type="date" value={issuedOn} onChange={(event) => setIssuedOn(event.target.value)} /></div><div><Label htmlFor="vendor-compliance-expires">Expires on</Label><Input id="vendor-compliance-expires" type="date" value={expiresOn} onChange={(event) => setExpiresOn(event.target.value)} /></div><div><Label htmlFor="vendor-compliance-bucket">Storage bucket</Label><Input id="vendor-compliance-bucket" value={storageBucket} onChange={(event) => setStorageBucket(event.target.value)} placeholder="Existing storage bucket" /></div><div><Label htmlFor="vendor-compliance-path">Storage path</Label><Input id="vendor-compliance-path" value={storagePath} onChange={(event) => setStoragePath(event.target.value)} placeholder="Existing object path" /></div><div><Label htmlFor="vendor-compliance-file">File name</Label><Input id="vendor-compliance-file" value={fileName} onChange={(event) => setFileName(event.target.value)} /></div></div><div><Label htmlFor="vendor-compliance-notes">Compliance notes</Label><TextArea id="vendor-compliance-notes" value={complianceNotes} onChange={setComplianceNotes} rows={2} /></div><Button type="submit" disabled={busy}>Save Compliance</Button></form> : null}
            <TableViewport><Table><TableHeader><TableRow><TableCell isHeader>Document</TableCell><TableCell isHeader>Status</TableCell><TableCell isHeader>Issued</TableCell><TableCell isHeader>Expires</TableCell><TableCell isHeader>File reference</TableCell></TableRow></TableHeader><TableBody>{detail.compliance_documents.length === 0 ? <TableStateRow colSpan={5}>No compliance documents recorded. W-9 and COI remain missing warnings.</TableStateRow> : detail.compliance_documents.map((document) => <TableRow key={document.id}><TableCell>{document.title}<div className="text-xs text-gray-500 dark:text-gray-400">{document.document_type.toUpperCase()}</div></TableCell><TableCell><Badge color={complianceColor(document.effective_status)}>{complianceLabel(document.effective_status)}</Badge></TableCell><TableCell>{document.issued_on ?? "—"}</TableCell><TableCell>{document.expires_on ?? "—"}</TableCell><TableCell>{document.file_name ?? document.storage_path ?? "—"}</TableCell></TableRow>)}</TableBody></Table></TableViewport>
          </ComponentCard>
        </>
      ) : <ComponentCard title="Vendor Detail"><div className="text-sm text-gray-500 dark:text-gray-400">Select a vendor to review Contacts, Source identities and Compliance.</div></ComponentCard>}
    </div>
  );
}
