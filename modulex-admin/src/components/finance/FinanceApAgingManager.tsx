"use client";

import { useEffect, useMemo, useState } from "react";
import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import ComponentCard from "@/components/common/ComponentCard";
import Label from "@/components/form/Label";
import Select from "@/components/form/Select";
import Input from "@/components/form/input/InputField";
import { Table, TableBody, TableCell, TableHeader, TableRow, TableStateRow, TableViewport } from "@/components/ui/table";
import { ADMIN_TEXT_STYLES } from "@/components/ui/theme/adminTheme";
import { getApAgingPage, getApAgingSummary, type ApAgingBucket, type ApAgingRow, type ApAgingSummary } from "@/lib/finance/apAging";
import { getVendorBillDetail, type VendorBillDetail } from "@/lib/finance/vendorBills";
import { getVendorPaymentsPage, type VendorPaymentListItem } from "@/lib/finance/vendorPayments";
import { getPaymentSchedulesPage, type PaymentScheduleListItem } from "@/lib/finance/paymentSchedule";
import { getVendorsPage, type VendorListItem } from "@/lib/finance/vendors";

const pageSize = 50;

const bucketOptions = [
  { value: "", label: "All aging buckets" },
  { value: "current", label: "Current" },
  { value: "1_30", label: "1–30 days" },
  { value: "31_60", label: "31–60 days" },
  { value: "61_90", label: "61–90 days" },
  { value: "90_plus", label: "90+ days" },
];

const bucketLabels: Record<ApAgingBucket, string> = {
  current: "Current",
  "1_30": "1–30",
  "31_60": "31–60",
  "61_90": "61–90",
  "90_plus": "90+",
};

function money(value: number | null, currency: string) {
  if (value === null || !Number.isFinite(Number(value))) return "Unavailable";
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(value));
}

function amount(value: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(value || 0));
}

function dateLabel(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric" }).format(new Date(`${value.slice(0, 10)}T12:00:00`));
}

function bucketColor(bucket: ApAgingBucket) {
  if (bucket === "current") return "success" as const;
  if (bucket === "1_30") return "warning" as const;
  return "error" as const;
}

export default function FinanceApAgingManager() {
  const [rows, setRows] = useState<ApAgingRow[]>([]);
  const [summary, setSummary] = useState<ApAgingSummary | null>(null);
  const [vendors, setVendors] = useState<VendorListItem[]>([]);
  const [vendorPayments, setVendorPayments] = useState<VendorPaymentListItem[]>([]);
  const [vendorSchedules, setVendorSchedules] = useState<PaymentScheduleListItem[]>([]);
  const [billDetail, setBillDetail] = useState<VendorBillDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [asOf, setAsOf] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [bucket, setBucket] = useState("");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);

  const vendorOptions = useMemo(
    () => [
      { value: "", label: "All vendors" },
      ...vendors.map((vendor) => ({ value: vendor.id, label: `${vendor.code} · ${vendor.display_name}` })),
    ],
    [vendors],
  );

  const totalCount = Number(rows[0]?.total_count ?? 0);
  const baseCurrency = summary?.base_currency_code ?? "USD";

  async function load(nextOffset = offset) {
    setLoading(true);
    setMessage(null);
    try {
      const selectedVendor = vendorId || null;
      const [nextSummary, nextRows, nextVendors, nextPayments, nextSchedules] = await Promise.all([
        getApAgingSummary({ asOf: asOf || null, vendorId: selectedVendor }),
        getApAgingPage({
          asOf: asOf || null,
          limit: pageSize,
          offset: nextOffset,
          vendorId: selectedVendor,
          bucket: (bucket || null) as ApAgingBucket | null,
          search,
        }),
        getVendorsPage({ limit: 200, offset: 0 }),
        selectedVendor ? getVendorPaymentsPage({ vendorId: selectedVendor, limit: 10, offset: 0 }) : Promise.resolve([]),
        selectedVendor ? getPaymentSchedulesPage({ vendorId: selectedVendor, limit: 10, offset: 0 }) : Promise.resolve([]),
      ]);
      setSummary(nextSummary);
      setRows(nextRows);
      setVendors(nextVendors);
      setVendorPayments(nextPayments);
      setVendorSchedules(nextSchedules);
      setOffset(nextOffset);
      if (!selectedVendor) {
        setVendorPayments([]);
        setVendorSchedules([]);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "AP Aging could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  async function viewBill(invoiceId: string) {
    setDetailLoading(true);
    setMessage(null);
    try {
      setBillDetail(await getVendorBillDetail(invoiceId));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Vendor Bill detail could not be loaded.");
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    void load(0);
    // Initial report load only; filters refresh explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasUnconverted = Boolean(summary && (summary.unconverted_bill_count > 0 || summary.checks.unconverted_count > 0));

  return (
    <div className="space-y-6">
      {message ? <Alert variant="error" title="AP Aging unavailable" message={message} /> : null}
      {hasUnconverted ? (
        <Alert
          variant="warning"
          title="Main-currency conversion incomplete"
          message={`${summary?.unconverted_bill_count ?? 0} bill(s) or ${summary?.checks.unconverted_count ?? 0} check payment(s) are missing a stored historical base-currency snapshot. Affected aggregate values are shown as unavailable rather than zero.`}
        />
      ) : null}

      <ComponentCard title="AP Aging" desc="Read-only projection over canonical Vendor Bills, payment allocations, schedules and Finance transactions.">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <Label htmlFor="ap-aging-as-of">As of date</Label>
            <Input id="ap-aging-as-of" type="date" value={asOf} onChange={(event) => setAsOf(event.target.value)} />
          </div>
          <div>
            <Label htmlFor="ap-aging-vendor">Vendor</Label>
            <Select id="ap-aging-vendor" options={vendorOptions} value={vendorId} onChange={setVendorId} />
          </div>
          <div>
            <Label htmlFor="ap-aging-bucket">Aging bucket</Label>
            <Select id="ap-aging-bucket" options={bucketOptions} value={bucket} onChange={setBucket} />
          </div>
          <div>
            <Label htmlFor="ap-aging-search">Search</Label>
            <Input id="ap-aging-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Vendor, invoice or PO" />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => void load(0)} disabled={loading}>{loading ? "Refreshing…" : "Refresh Report"}</Button>
          <Button variant="outline" onClick={() => { setAsOf(""); setVendorId(""); setBucket(""); setSearch(""); void load(0); }} disabled={loading}>Reset Filters</Button>
        </div>
      </ComponentCard>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <ComponentCard title="Open AP" desc={`${summary?.open_bill_count ?? 0} open bill(s)`}>
          <div className={`text-xl font-semibold ${ADMIN_TEXT_STYLES.strong}`}>{summary ? money(summary.open_ap_base_amount, baseCurrency) : "—"}</div>
        </ComponentCard>
        <ComponentCard title="Overdue" desc={`${summary?.overdue_bill_count ?? 0} overdue bill(s)`}>
          <div className={`text-xl font-semibold ${ADMIN_TEXT_STYLES.strong}`}>{summary ? money(summary.overdue_base_amount, baseCurrency) : "—"}</div>
        </ComponentCard>
        <ComponentCard title="Due Soon" desc="Due within 7 days">
          <div className={`text-xl font-semibold ${ADMIN_TEXT_STYLES.strong}`}>{summary ? money(summary.due_soon_base_amount, baseCurrency) : "—"}</div>
        </ComponentCard>
        <ComponentCard title="Scheduled" desc="Active planned payments">
          <div className={`text-xl font-semibold ${ADMIN_TEXT_STYLES.strong}`}>{summary ? money(summary.scheduled_base_amount, baseCurrency) : "—"}</div>
        </ComponentCard>
        <ComponentCard title="Outstanding Checks" desc={`${summary?.checks.issued_count ?? 0} issued check(s)`}>
          <div className={`text-xl font-semibold ${ADMIN_TEXT_STYLES.strong}`}>{summary ? money(summary.checks.issued_base_amount, baseCurrency) : "—"}</div>
        </ComponentCard>
        <ComponentCard title="Cleared Checks" desc={`${summary?.checks.cleared_count ?? 0} cleared check(s)`}>
          <div className={`text-xl font-semibold ${ADMIN_TEXT_STYLES.strong}`}>{summary ? money(summary.checks.cleared_base_amount, baseCurrency) : "—"}</div>
        </ComponentCard>
      </div>

      <ComponentCard title="Aging Buckets" desc={`Main-currency open payable as of ${summary?.as_of ? dateLabel(summary.as_of) : "current date"}.`}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {(Object.keys(bucketLabels) as ApAgingBucket[]).map((key) => (
            <div key={key} className="space-y-1">
              <div className={`text-xs font-medium uppercase tracking-wide ${ADMIN_TEXT_STYLES.muted}`}>{bucketLabels[key]}</div>
              <div className={`text-lg font-semibold ${ADMIN_TEXT_STYLES.strong}`}>{summary ? money(summary.aging_buckets[key], baseCurrency) : "—"}</div>
            </div>
          ))}
        </div>
      </ComponentCard>

      <ComponentCard title="Open Vendor Bills" desc="Outstanding is derived from append-only payment allocations; no payable balance is manually maintained.">
        <TableViewport minWidth="xl">
          <Table>
            <TableHeader>
              <TableRow>
                <TableCell isHeader>Vendor</TableCell>
                <TableCell isHeader>Invoice</TableCell>
                <TableCell isHeader>Due</TableCell>
                <TableCell isHeader>Aging</TableCell>
                <TableCell isHeader>Outstanding</TableCell>
                <TableCell isHeader>Base Outstanding</TableCell>
                <TableCell isHeader>Scheduled</TableCell>
                <TableCell isHeader>Payment</TableCell>
                <TableCell isHeader>Action</TableCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? <TableStateRow colSpan={9}>Loading AP Aging…</TableStateRow> : rows.length === 0 ? <TableStateRow colSpan={9}>No open AP bills match the current filters.</TableStateRow> : rows.map((row) => (
                <TableRow key={row.invoice_id}>
                  <TableCell><div className={`font-medium ${ADMIN_TEXT_STYLES.strong}`}>{row.vendor_name}</div><div className={`text-xs ${ADMIN_TEXT_STYLES.muted}`}>{row.vendor_code}</div></TableCell>
                  <TableCell><div className={`font-medium ${ADMIN_TEXT_STYLES.strong}`}>{row.invoice_number}</div>{row.purchase_order_reference ? <div className={`text-xs ${ADMIN_TEXT_STYLES.muted}`}>PO {row.purchase_order_reference}</div> : null}</TableCell>
                  <TableCell>{dateLabel(row.due_date)}</TableCell>
                  <TableCell><Badge color={bucketColor(row.aging_bucket)}>{bucketLabels[row.aging_bucket]}</Badge></TableCell>
                  <TableCell>{amount(row.outstanding_amount, row.currency_code)}</TableCell>
                  <TableCell>{row.unconverted ? <Badge color="warning">Unconverted</Badge> : money(row.base_outstanding_amount, row.base_currency_code)}</TableCell>
                  <TableCell>{amount(row.scheduled_amount, row.currency_code)}</TableCell>
                  <TableCell>{row.payment_status.replaceAll("_", " ")}</TableCell>
                  <TableCell><Button size="sm" variant="outline" onClick={() => void viewBill(row.invoice_id)} disabled={detailLoading}>View</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableViewport>
        <div className="mt-4 flex items-center justify-between gap-3">
          <div className={`text-sm ${ADMIN_TEXT_STYLES.muted}`}>{totalCount} bill(s)</div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => void load(Math.max(0, offset - pageSize))} disabled={loading || offset === 0}>Previous</Button>
            <Button size="sm" variant="outline" onClick={() => void load(offset + pageSize)} disabled={loading || offset + pageSize >= totalCount}>Next</Button>
          </div>
        </div>
      </ComponentCard>

      {billDetail ? (
        <ComponentCard title={`Invoice ${String(billDetail.invoice.invoice_number ?? "")}`} desc="Canonical Vendor Bill detail; this report does not own or edit the bill.">
          <div className="grid gap-4 text-sm md:grid-cols-2 xl:grid-cols-4">
            <div><div className={ADMIN_TEXT_STYLES.muted}>Vendor</div><div className={`font-medium ${ADMIN_TEXT_STYLES.strong}`}>{billDetail.vendor?.display_name ?? billDetail.invoice.vendor_name_snapshot}</div></div>
            <div><div className={ADMIN_TEXT_STYLES.muted}>Total</div><div className={`font-medium ${ADMIN_TEXT_STYLES.strong}`}>{amount(Number(billDetail.invoice.total_amount ?? 0), String(billDetail.invoice.currency_code ?? "USD"))}</div></div>
            <div><div className={ADMIN_TEXT_STYLES.muted}>Paid</div><div className={`font-medium ${ADMIN_TEXT_STYLES.strong}`}>{amount(Number(billDetail.invoice.paid_amount ?? 0), String(billDetail.invoice.currency_code ?? "USD"))}</div></div>
            <div><div className={ADMIN_TEXT_STYLES.muted}>Outstanding</div><div className={`font-medium ${ADMIN_TEXT_STYLES.strong}`}>{amount(Number(billDetail.invoice.outstanding_amount ?? 0), String(billDetail.invoice.currency_code ?? "USD"))}</div></div>
          </div>
        </ComponentCard>
      ) : null}

      {vendorId ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <ComponentCard title="Vendor Payment History" desc="Canonical Finance vendor payments and check lifecycle for the selected Vendor.">
            <TableViewport minWidth="md">
              <Table>
                <TableHeader><TableRow><TableCell isHeader>Date</TableCell><TableCell isHeader>Amount</TableCell><TableCell isHeader>Method / Check</TableCell><TableCell isHeader>Status</TableCell></TableRow></TableHeader>
                <TableBody>{vendorPayments.length === 0 ? <TableStateRow colSpan={4}>No Vendor payment history.</TableStateRow> : vendorPayments.map((payment) => <TableRow key={payment.id}><TableCell>{dateLabel(payment.transaction_at)}</TableCell><TableCell>{amount(payment.amount, payment.currency_code)}</TableCell><TableCell>{payment.payment_method_name ?? "—"}{payment.instrument_number ? <div className={`text-xs ${ADMIN_TEXT_STYLES.muted}`}>Check {payment.instrument_number}</div> : null}</TableCell><TableCell>{payment.instrument_status ?? payment.status}</TableCell></TableRow>)}</TableBody>
              </Table>
            </TableViewport>
          </ComponentCard>
          <ComponentCard title="Vendor Scheduled Payments" desc="Planned payments remain operational schedules and do not change account balances.">
            <TableViewport minWidth="md">
              <Table>
                <TableHeader><TableRow><TableCell isHeader>Invoice</TableCell><TableCell isHeader>Scheduled</TableCell><TableCell isHeader>Amount</TableCell><TableCell isHeader>Status</TableCell></TableRow></TableHeader>
                <TableBody>{vendorSchedules.length === 0 ? <TableStateRow colSpan={4}>No Vendor payment schedules.</TableStateRow> : vendorSchedules.map((schedule) => <TableRow key={schedule.id}><TableCell>{schedule.invoice_number}</TableCell><TableCell>{dateLabel(schedule.scheduled_payment_date)}</TableCell><TableCell>{amount(schedule.planned_amount, schedule.currency_code)}</TableCell><TableCell>{schedule.display_status}</TableCell></TableRow>)}</TableBody>
              </Table>
            </TableViewport>
          </ComponentCard>
        </div>
      ) : null}
    </div>
  );
}
