"use client";

import { useEffect, useMemo, useState } from "react";
import DateInput from "@/components/form/DateInput";
import Label from "@/components/form/Label";
import Select from "@/components/form/Select";
import Input from "@/components/form/input/InputField";
import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { Modal } from "@/components/ui/modal";
import { Table, TableBody, TableCell, TableHeader, TableRow, TableStateRow, TableViewport } from "@/components/ui/table";
import { ADMIN_TEXT_STYLES } from "@/components/ui/theme/adminTheme";
import { formatDateOnly } from "@/lib/dates/usDate";
import {
  deleteVendorBillDraft,
  getVendorBillsPage,
  type VendorBillDocumentStatus,
  type VendorBillListItem,
  type VendorBillPaymentStatus,
} from "@/lib/finance/vendorBills";
import { getVendorsPage, type VendorListItem } from "@/lib/finance/vendors";
import VendorBillDetailPanel from "@/components/finance/vendor-payables/VendorBillDetailPanel";
import VendorBillEditorModal from "@/components/finance/vendor-payables/VendorBillEditorModal";

const statusOptions = [
  { value: "draft", label: "Draft" },
  { value: "unpaid", label: "Unpaid" },
  { value: "partially_paid", label: "Partially Paid" },
  { value: "paid", label: "Paid" },
  { value: "void", label: "Void" },
];

function money(value: number, currency: string) {
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(value || 0)); }
  catch { return `${Number(value || 0).toFixed(2)} ${currency}`; }
}

function statusColor(status: VendorBillPaymentStatus) {
  if (status === "paid") return "success" as const;
  if (status === "partially_paid") return "warning" as const;
  if (status === "void") return "error" as const;
  if (status === "draft") return "light" as const;
  return "info" as const;
}

export default function VendorBillsPanel({
  canManage,
  initialVendorId = "",
  initialOrderId = "",
}: {
  canManage: boolean;
  initialVendorId?: string;
  initialOrderId?: string;
}) {
  const [bills, setBills] = useState<VendorBillListItem[]>([]);
  const [vendors, setVendors] = useState<VendorListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ variant: "success" | "error"; text: string } | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [vendorFilter, setVendorFilter] = useState(initialVendorId);
  const [dueBefore, setDueBefore] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [orderFilter, setOrderFilter] = useState(initialOrderId);
  const [currencyFilter, setCurrencyFilter] = useState("");
  const [offset, setOffset] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingBill, setEditingBill] = useState<VendorBillListItem | null>(null);
  const pageSize = 50;

  useEffect(() => { setVendorFilter(initialVendorId); }, [initialVendorId]);
  useEffect(() => { setOrderFilter(initialOrderId); }, [initialOrderId]);

  async function load(nextOffset = offset) {
    setLoading(true);
    try {
      const [nextBills, nextVendors] = await Promise.all([
        getVendorBillsPage({
          limit: pageSize,
          offset: nextOffset,
          vendorId: vendorFilter || null,
          status: (statusFilter || null) as VendorBillDocumentStatus | VendorBillPaymentStatus | null,
          search: search || null,
          dueBefore: dueBefore || null,
          projectId: projectFilter || null,
          orderId: orderFilter || null,
          currencyCode: currencyFilter || null,
        }),
        vendors.length ? Promise.resolve(vendors) : getVendorsPage({ limit: 200 }),
      ]);
      setBills(nextBills);
      setVendors(nextVendors);
      setOffset(nextOffset);
      setMessage(null);
    } catch (error) {
      setMessage({ variant: "error", text: error instanceof Error ? error.message : "Vendor Bills could not be loaded." });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(0); }, [initialVendorId, initialOrderId]); // eslint-disable-line react-hooks/exhaustive-deps

  const vendorOptions = useMemo(() => vendors.map((vendor) => ({ value: vendor.id, label: `${vendor.code} · ${vendor.display_name}` })), [vendors]);
  const totalCount = Number(bills[0]?.total_count ?? 0);

  function openCreate() {
    setEditingBill(null);
    setEditorOpen(true);
  }

  function openEdit(bill: VendorBillListItem) {
    setEditingBill(bill);
    setEditorOpen(true);
  }

  async function afterSaved(invoiceId: string) {
    setEditorOpen(false);
    setEditingBill(null);
    await load(0);
    setSelectedId(invoiceId);
    setMessage({ variant: "success", text: "Vendor Bill Draft saved." });
  }

  async function removeDraft(bill: VendorBillListItem) {
    if (!canManage || busy || bill.status !== "draft") return;
    setBusy(true);
    try {
      await deleteVendorBillDraft(bill.id);
      if (selectedId === bill.id) setSelectedId(null);
      await load(offset);
      setMessage({ variant: "success", text: "Vendor Bill Draft cancelled. AP history remains preserved by the canonical workflow." });
    } catch (error) {
      setMessage({ variant: "error", text: error instanceof Error ? error.message : "Vendor Bill Draft could not be cancelled." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {message ? <Alert variant={message.variant} title="Vendor Bills" message={message.text} /> : null}
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><h3 className="text-lg font-semibold">Vendor Bills</h3><p className={ADMIN_TEXT_STYLES.muted}>Real AP source documents. Order attribution and payment settlement are handled inside each Bill.</p></div>
          {canManage ? <Button onClick={openCreate}>+ Add Vendor Bill</Button> : null}
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div><Label htmlFor="vendor-bills-search">Search</Label><Input id="vendor-bills-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Vendor, Bill, reference" /></div>
          <div><Label htmlFor="vendor-bills-vendor">Vendor</Label><Select id="vendor-bills-vendor" options={vendorOptions} value={vendorFilter} onChange={setVendorFilter} placeholder="All Vendors" allowEmpty /></div>
          <div><Label htmlFor="vendor-bills-status">Status</Label><Select id="vendor-bills-status" options={statusOptions} value={statusFilter} onChange={setStatusFilter} placeholder="All statuses" allowEmpty /></div>
          <div><Label htmlFor="vendor-bills-due">Due before</Label><DateInput id="vendor-bills-due" value={dueBefore} onChange={setDueBefore} /></div>
          <div><Label htmlFor="vendor-bills-project">Project ID</Label><Input id="vendor-bills-project" value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)} /></div>
          <div><Label htmlFor="vendor-bills-order">Order ID</Label><Input id="vendor-bills-order" value={orderFilter} onChange={(event) => setOrderFilter(event.target.value)} /></div>
          <div><Label htmlFor="vendor-bills-currency">Currency</Label><Input id="vendor-bills-currency" value={currencyFilter} maxLength={3} onChange={(event) => setCurrencyFilter(event.target.value.toUpperCase())} /></div>
        </div>
        <div className="flex gap-3"><Button variant="outline" disabled={loading || busy} onClick={() => void load(0)}>Apply Filters</Button><Button variant="ghost" disabled={loading || busy} onClick={() => void load(offset)}>Retry / Refresh</Button></div>

        <TableViewport>
          <Table variant="admin" minWidth="wide"><TableHeader variant="admin"><TableRow>
            <TableCell isHeader variant="admin">Vendor / Bill</TableCell><TableCell isHeader variant="admin">Bill / Due</TableCell><TableCell isHeader variant="admin" className="text-right">Total</TableCell><TableCell isHeader variant="admin" className="text-right">Paid</TableCell><TableCell isHeader variant="admin" className="text-right">Outstanding</TableCell><TableCell isHeader variant="admin">Projects / Orders</TableCell><TableCell isHeader variant="admin">Status</TableCell><TableCell isHeader variant="admin">Action</TableCell>
          </TableRow></TableHeader><TableBody variant="admin">
            {loading ? <TableStateRow colSpan={8}>Loading Vendor Bills…</TableStateRow> : bills.length === 0 ? <TableStateRow colSpan={8}>No Vendor Bills match the current filters.</TableStateRow> : bills.map((bill) => <TableRow key={bill.id}>
              <TableCell variant="admin"><span className="font-medium">{bill.vendor_name_snapshot}</span><div className={`text-xs ${ADMIN_TEXT_STYLES.muted}`}>{bill.invoice_number}</div></TableCell>
              <TableCell variant="admin">{formatDateOnly(bill.invoice_date)}<div className={`text-xs ${ADMIN_TEXT_STYLES.muted}`}>Due {bill.due_date ? formatDateOnly(bill.due_date) : "—"}</div></TableCell>
              <TableCell variant="admin" className="text-right">{money(bill.total_amount, bill.currency_code)}</TableCell>
              <TableCell variant="admin" className="text-right">{money(bill.paid_amount, bill.currency_code)}</TableCell>
              <TableCell variant="admin" className="text-right font-medium">{money(bill.outstanding_amount, bill.currency_code)}</TableCell>
              <TableCell variant="admin">{bill.project_count} / {bill.order_count}</TableCell>
              <TableCell variant="admin"><Badge color={statusColor(bill.payment_status)}>{bill.payment_status.replaceAll("_", " ")}</Badge></TableCell>
              <TableCell variant="admin"><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => setSelectedId(bill.id)}>Review</Button>{canManage && bill.status === "draft" ? <><Button size="sm" variant="ghost" onClick={() => openEdit(bill)}>Edit</Button><Button size="sm" variant="danger" disabled={busy} onClick={() => void removeDraft(bill)}>Cancel Draft</Button></> : null}</div></TableCell>
            </TableRow>)}
          </TableBody></Table>
        </TableViewport>
        <div className="flex items-center justify-between text-sm"><span className={ADMIN_TEXT_STYLES.muted}>{totalCount} Vendor Bill{totalCount === 1 ? "" : "s"}</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={loading || offset === 0} onClick={() => void load(Math.max(0, offset - pageSize))}>Previous</Button><Button size="sm" variant="outline" disabled={loading || offset + pageSize >= totalCount} onClick={() => void load(offset + pageSize)}>Next</Button></div></div>
      </div>

      <VendorBillEditorModal isOpen={editorOpen} vendors={vendors} editingBill={editingBill} onClose={() => { setEditorOpen(false); setEditingBill(null); }} onSaved={afterSaved} />
      <Modal isOpen={Boolean(selectedId)} onClose={() => setSelectedId(null)} className="relative w-full max-w-6xl p-6 lg:p-8" ariaLabel="Vendor Bill detail">
        {selectedId ? <VendorBillDetailPanel invoiceId={selectedId} canManage={canManage} onChanged={() => load(offset)} /> : null}
      </Modal>
    </>
  );
}
