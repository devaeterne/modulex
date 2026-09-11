"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import Label from "@/components/form/Label";
import Select from "@/components/form/Select";
import Input from "@/components/form/input/InputField";
import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { Modal } from "@/components/ui/modal";
import { Table, TableBody, TableCell, TableHeader, TableRow, TableStateRow, TableViewport } from "@/components/ui/table";
import { ADMIN_COMPAT_APPEARANCE, ADMIN_TEXT_STYLES } from "@/components/ui/theme/adminTheme";
import { getCustomVendorCabinetDocument, getCustomVendorCabinetDocumentUrl } from "@/lib/customers/custom-vendor-cabinet";
import { getVendorsPage, type VendorListItem } from "@/lib/finance/vendors";
import {
  getVendorOrderCommitmentDetail,
  getVendorOrderCommitmentsPage,
  type VendorCommitmentInvoiceState,
  type VendorCommitmentPaymentState,
  type VendorCommitmentState,
  type VendorOrderCommitment,
  type VendorOrderCommitmentDetail,
} from "@/lib/finance/vendorPayables";

const commitmentOptions = [
  { value: "planned", label: "Planned" },
  { value: "committed", label: "Committed" },
  { value: "cancelled", label: "Cancelled" },
];
const invoiceOptions = [
  { value: "not_invoiced", label: "Not Invoiced" },
  { value: "partially_invoiced", label: "Partially Invoiced" },
  { value: "invoiced", label: "Invoiced" },
];
const paymentOptions = [
  { value: "unpaid", label: "Unpaid" },
  { value: "partially_paid", label: "Partially Paid" },
  { value: "paid", label: "Paid" },
];

function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(value || 0));
  } catch {
    return `${Number(value || 0).toFixed(2)} ${currency}`;
  }
}

function statusColor(status: string) {
  if (["committed", "invoiced", "paid"].includes(status)) return "success" as const;
  if (["cancelled"].includes(status)) return "error" as const;
  if (["partially_invoiced", "partially_paid"].includes(status)) return "warning" as const;
  return "light" as const;
}

function statusLabel(status: string) {
  return status.replaceAll("_", " ").replace(/\b\w/g, (value) => value.toUpperCase());
}

export default function VendorCommitmentsPanel({
  initialVendorId = "",
  initialOrderId = "",
  embedded = false,
  onOpenBills,
}: {
  initialVendorId?: string;
  initialOrderId?: string;
  embedded?: boolean;
  onOpenBills?: (vendorId: string, orderId: string) => void;
}) {
  const [rows, setRows] = useState<VendorOrderCommitment[]>([]);
  const [vendors, setVendors] = useState<VendorListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<VendorOrderCommitmentDetail | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [vendorFilter, setVendorFilter] = useState(initialVendorId);
  const [commitmentFilter, setCommitmentFilter] = useState("");
  const [invoiceFilter, setInvoiceFilter] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [orderFilter, setOrderFilter] = useState(initialOrderId);
  const [offset, setOffset] = useState(0);
  const pageSize = 50;

  useEffect(() => { setVendorFilter(initialVendorId); }, [initialVendorId]);
  useEffect(() => { setOrderFilter(initialOrderId); }, [initialOrderId]);

  async function load(nextOffset = offset) {
    setLoading(true);
    try {
      const [nextRows, nextVendors] = await Promise.all([
        getVendorOrderCommitmentsPage({
          limit: pageSize,
          offset: nextOffset,
          vendorId: vendorFilter || null,
          commitmentStatus: (commitmentFilter || null) as VendorCommitmentState | null,
          invoiceStatus: (invoiceFilter || null) as VendorCommitmentInvoiceState | null,
          paymentStatus: (paymentFilter || null) as VendorCommitmentPaymentState | null,
          projectId: projectFilter || null,
          orderId: orderFilter || null,
          search: search || null,
        }),
        vendors.length ? Promise.resolve(vendors) : getVendorsPage({ limit: 200 }),
      ]);
      setRows(nextRows);
      setVendors(nextVendors);
      setOffset(nextOffset);
      setMessage(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Vendor commitments could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(0);
    // Initial query is owned by the parent-provided filters; operators apply local filters explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialVendorId, initialOrderId]);

  async function openDetail(row: VendorOrderCommitment) {
    setDetailLoading(true);
    try {
      setDetail(await getVendorOrderCommitmentDetail(row.order_item_id));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Vendor commitment detail could not be loaded.");
    } finally {
      setDetailLoading(false);
    }
  }

  async function viewPdf() {
    if (!detail?.commitment.source_document_id) return;
    try {
      const document = await getCustomVendorCabinetDocument(detail.commitment.source_document_id);
      const url = await getCustomVendorCabinetDocumentUrl(document);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Vendor PDF could not be opened.");
    }
  }

  const vendorOptions = useMemo(
    () => vendors.map((vendor) => ({ value: vendor.id, label: `${vendor.code} · ${vendor.display_name}` })),
    [vendors],
  );
  const totalCount = Number(rows[0]?.total_count ?? 0);

  return (
    <>
      {message ? <Alert variant="error" title="Vendor Payables" message={message} /> : null}
      <ComponentCard
        title={embedded ? "Vendor Commitments" : "Commitments"}
        desc="Vendor Cabinet Order cost is the commitment source. Invoiced and Paid values come only from real Vendor Bills and posted Vendor Payments."
      >
        <div className="space-y-4">
          {!embedded ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div><Label htmlFor="commitment-search">Search</Label><Input id="commitment-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Vendor, Project, Order, description" /></div>
              <div><Label htmlFor="commitment-vendor">Vendor</Label><Select id="commitment-vendor" options={vendorOptions} value={vendorFilter} onChange={setVendorFilter} placeholder="All Vendors" allowEmpty /></div>
              <div><Label htmlFor="commitment-state">Commitment status</Label><Select id="commitment-state" options={commitmentOptions} value={commitmentFilter} onChange={setCommitmentFilter} placeholder="All statuses" allowEmpty /></div>
              <div><Label htmlFor="commitment-invoice">Invoice status</Label><Select id="commitment-invoice" options={invoiceOptions} value={invoiceFilter} onChange={setInvoiceFilter} placeholder="All invoice states" allowEmpty /></div>
              <div><Label htmlFor="commitment-payment">Payment status</Label><Select id="commitment-payment" options={paymentOptions} value={paymentFilter} onChange={setPaymentFilter} placeholder="All payment states" allowEmpty /></div>
              <div><Label htmlFor="commitment-project">Project ID</Label><Input id="commitment-project" value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)} placeholder="Optional Project UUID" /></div>
              <div><Label htmlFor="commitment-order">Order ID</Label><Input id="commitment-order" value={orderFilter} onChange={(event) => setOrderFilter(event.target.value)} placeholder="Optional Order UUID" /></div>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" disabled={loading} onClick={() => void load(0)}>Apply Filters</Button>
            <Button variant="ghost" disabled={loading} onClick={() => void load(offset)}>Retry / Refresh</Button>
          </div>

          <TableViewport>
            <Table variant="admin" minWidth="wide">
              <TableHeader variant="admin"><TableRow>
                <TableCell isHeader variant="admin">Vendor</TableCell>
                <TableCell isHeader variant="admin">Project / Order</TableCell>
                <TableCell isHeader variant="admin">Description</TableCell>
                <TableCell isHeader variant="admin" className="text-right">Committed</TableCell>
                <TableCell isHeader variant="admin" className="text-right">Invoiced</TableCell>
                <TableCell isHeader variant="admin" className="text-right">Paid</TableCell>
                <TableCell isHeader variant="admin" className="text-right">Remaining</TableCell>
                <TableCell isHeader variant="admin">Status</TableCell>
                <TableCell isHeader variant="admin">Action</TableCell>
              </TableRow></TableHeader>
              <TableBody variant="admin">
                {loading ? <TableStateRow colSpan={9}>Loading Vendor commitments…</TableStateRow> : rows.length === 0 ? <TableStateRow colSpan={9}>No Vendor Cabinet commitments match the current filters.</TableStateRow> : rows.map((row) => (
                  <TableRow key={row.order_item_id}>
                    <TableCell variant="admin"><span className="font-medium">{row.vendor_name}</span><div className={`text-xs ${ADMIN_TEXT_STYLES.muted}`}>{row.vendor_code}</div></TableCell>
                    <TableCell variant="admin"><div>{row.project_number ?? "No Project"}</div><div className={`text-xs ${ADMIN_TEXT_STYLES.muted}`}>{row.order_number}</div></TableCell>
                    <TableCell variant="admin">{row.line_description}</TableCell>
                    <TableCell variant="admin" className="text-right">{money(row.committed_amount, row.currency_code)}</TableCell>
                    <TableCell variant="admin" className="text-right">{money(row.invoiced_amount, row.currency_code)}</TableCell>
                    <TableCell variant="admin" className="text-right">{money(row.paid_amount, row.currency_code)}</TableCell>
                    <TableCell variant="admin" className="text-right font-medium">{money(row.remaining_exposure, row.currency_code)}</TableCell>
                    <TableCell variant="admin"><div className="flex flex-col items-start gap-1"><Badge color={statusColor(row.commitment_status)}>{statusLabel(row.commitment_status)}</Badge><Badge color={statusColor(row.invoice_status)}>{statusLabel(row.invoice_status)}</Badge><Badge color={statusColor(row.payment_status)}>{statusLabel(row.payment_status)}</Badge></div></TableCell>
                    <TableCell variant="admin"><Button size="sm" variant="outline" onClick={() => void openDetail(row)}>Review</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableViewport>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className={ADMIN_TEXT_STYLES.muted}>{totalCount} commitment{totalCount === 1 ? "" : "s"}</span>
            <div className="flex gap-2"><Button size="sm" variant="outline" disabled={loading || offset === 0} onClick={() => void load(Math.max(0, offset - pageSize))}>Previous</Button><Button size="sm" variant="outline" disabled={loading || offset + pageSize >= totalCount} onClick={() => void load(offset + pageSize)}>Next</Button></div>
          </div>
        </div>
      </ComponentCard>

      <Modal isOpen={Boolean(detail) || detailLoading} onClose={() => !detailLoading && setDetail(null)} className="relative w-full max-w-5xl p-6 lg:p-8" ariaLabel="Vendor commitment detail">
        {detailLoading || !detail ? <div className="py-12 text-center">Loading commitment detail…</div> : (
          <div className="space-y-6">
            <div><h3 className="text-xl font-semibold">{detail.commitment.line_description}</h3><p className={ADMIN_TEXT_STYLES.muted}>{detail.commitment.vendor_name} · {detail.commitment.order_number}</p></div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
              <div><div className={`text-xs ${ADMIN_TEXT_STYLES.muted}`}>Committed</div><div className="font-semibold">{money(detail.commitment.committed_amount, detail.commitment.currency_code)}</div></div>
              <div><div className={`text-xs ${ADMIN_TEXT_STYLES.muted}`}>Invoiced</div><div className="font-semibold">{money(detail.commitment.invoiced_amount, detail.commitment.currency_code)}</div></div>
              <div><div className={`text-xs ${ADMIN_TEXT_STYLES.muted}`}>Paid</div><div className="font-semibold">{money(detail.commitment.paid_amount, detail.commitment.currency_code)}</div></div>
              <div><div className={`text-xs ${ADMIN_TEXT_STYLES.muted}`}>Remaining</div><div className="font-semibold">{money(detail.commitment.remaining_exposure, detail.commitment.currency_code)}</div></div>
              <div><div className={`text-xs ${ADMIN_TEXT_STYLES.muted}`}>Invoice variance</div><div className="font-semibold">{money(detail.commitment.invoice_variance, detail.commitment.currency_code)}</div></div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={`/customers/${detail.commitment.customer_id}/orders/${detail.commitment.order_id}`}><Button size="sm" variant="outline">View Order</Button></Link>
              {detail.commitment.project_id ? <Link href={`/projects/${detail.commitment.project_id}`}><Button size="sm" variant="outline">View Project</Button></Link> : null}
              <Link href={`/finance/vendors?vendor=${detail.commitment.vendor_id}`}><Button size="sm" variant="outline">View Vendor</Button></Link>
              {detail.commitment.source_document_id ? <Button size="sm" variant="outline" onClick={() => void viewPdf()}>View Vendor PDF</Button> : null}
              {onOpenBills ? <Button size="sm" onClick={() => onOpenBills(detail.commitment.vendor_id, detail.commitment.order_id)}>Vendor Bills</Button> : <Link href={`/finance/bills?tab=bills&vendor=${detail.commitment.vendor_id}&order=${detail.commitment.order_id}`}><Button size="sm">Vendor Bills</Button></Link>}
            </div>
            <div>
              <h4 className="mb-2 font-semibold">Linked Vendor Bills</h4>
              {detail.bill_allocations.length === 0 ? <p className={ADMIN_TEXT_STYLES.muted}>No Open Vendor Bill allocations.</p> : <div className="space-y-2">{detail.bill_allocations.map((allocation) => <div key={allocation.id} className={`flex flex-wrap justify-between gap-2 border p-3 ${ADMIN_COMPAT_APPEARANCE["rounded-lg"]} ${ADMIN_COMPAT_APPEARANCE["border-gray-200"]} ${ADMIN_COMPAT_APPEARANCE["dark:border-gray-800"]}`}><span>{allocation.invoice_number} · {allocation.line_description}</span><span className="font-medium">{money(Number(allocation.amount), allocation.currency_code)}</span></div>)}</div>}
              {detail.draft_allocations.length ? <p className={`mt-2 text-xs ${ADMIN_TEXT_STYLES.muted}`}>{detail.draft_allocations.length} Draft Bill allocation preview{detail.draft_allocations.length === 1 ? "" : "s"} not included in Invoiced totals.</p> : null}
            </div>
            <div>
              <h4 className="mb-2 font-semibold">Order Settlement History</h4>
              {detail.settlements.length === 0 ? <p className={ADMIN_TEXT_STYLES.muted}>No Vendor Payment settlement has been attributed to this Order commitment.</p> : <div className="space-y-2">{detail.settlements.map((settlement) => <div key={settlement.id} className={`flex flex-wrap justify-between gap-2 border p-3 ${ADMIN_COMPAT_APPEARANCE["rounded-lg"]} ${ADMIN_COMPAT_APPEARANCE["border-gray-200"]} ${ADMIN_COMPAT_APPEARANCE["dark:border-gray-800"]}`}><span>{settlement.invoice_number ?? "Vendor Bill"}{settlement.transaction_reference ? ` · ${settlement.transaction_reference}` : ""}</span><span className={settlement.amount_delta < 0 ? "font-medium text-error-600" : "font-medium"}>{money(Number(settlement.amount_delta), settlement.currency_code)}</span></div>)}</div>}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
