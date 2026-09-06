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
import {
  getArAgingPage,
  getArAgingSummary,
  getCustomerArBalance,
  getCustomerPaymentHistory,
  type ArAgingBucket,
  type ArAgingRow,
  type ArAgingSummary,
  type CustomerArBalance,
  type CustomerPaymentHistoryRow,
} from "@/lib/finance/arAging";
import { getCustomerReceiptReferenceData, type CustomerReceiptCustomerOption } from "@/lib/finance/customer-receipts";

const pageSize = 50;

const bucketOptions = [
  { value: "", label: "All aging buckets" },
  { value: "current", label: "Current" },
  { value: "1_30", label: "1–30 days" },
  { value: "31_60", label: "31–60 days" },
  { value: "61_90", label: "61–90 days" },
  { value: "90_plus", label: "90+ days" },
];

const bucketLabels: Record<ArAgingBucket, string> = {
  current: "Current",
  "1_30": "1–30",
  "31_60": "31–60",
  "61_90": "61–90",
  "90_plus": "90+",
};

function money(value: string | number | null | undefined, currency: string) {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
}

function dateLabel(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric" }).format(new Date(value.length === 10 ? `${value}T12:00:00` : value));
}

function bucketColor(bucket: ArAgingBucket) {
  if (bucket === "current") return "success" as const;
  if (bucket === "1_30") return "warning" as const;
  return "error" as const;
}

function sourceLabel(source: CustomerPaymentHistoryRow["source_kind"]) {
  return source === "finance_receipt" ? "Finance Receipt" : "Legacy Project Payment";
}

export default function FinanceArAgingManager() {
  const [rows, setRows] = useState<ArAgingRow[]>([]);
  const [summary, setSummary] = useState<ArAgingSummary | null>(null);
  const [customers, setCustomers] = useState<CustomerReceiptCustomerOption[]>([]);
  const [customerBalance, setCustomerBalance] = useState<CustomerArBalance | null>(null);
  const [paymentHistory, setPaymentHistory] = useState<CustomerPaymentHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [asOf, setAsOf] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [bucket, setBucket] = useState("");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);

  const customerOptions = useMemo(
    () => [
      { value: "", label: "All customers" },
      ...customers.map((customer) => ({ value: customer.id, label: `${customer.customer_code} · ${customer.name}` })),
    ],
    [customers],
  );

  const totalCount = Number(rows[0]?.total_count ?? 0);
  const currencies = Object.entries(summary?.currency_totals ?? {}).sort(([a], [b]) => a.localeCompare(b));

  async function load(nextOffset = offset, overrides?: { asOf?: string; customerId?: string; bucket?: string; search?: string }) {
    const nextAsOf = overrides?.asOf ?? asOf;
    const nextCustomerId = overrides?.customerId ?? customerId;
    const nextBucket = overrides?.bucket ?? bucket;
    const nextSearch = overrides?.search ?? search;
    setLoading(true);
    setMessage(null);
    try {
      const selectedCustomer = nextCustomerId || null;
      const [nextRows, nextSummary, referenceData, balance, history] = await Promise.all([
        getArAgingPage({
          limit: pageSize,
          offset: nextOffset,
          customerId: selectedCustomer,
          bucket: (nextBucket || null) as ArAgingBucket | null,
          search: nextSearch,
          asOf: nextAsOf || null,
        }),
        getArAgingSummary({ customerId: selectedCustomer, asOf: nextAsOf || null }),
        getCustomerReceiptReferenceData(),
        selectedCustomer ? getCustomerArBalance(selectedCustomer, nextAsOf || null) : Promise.resolve(null),
        selectedCustomer ? getCustomerPaymentHistory(selectedCustomer, { limit: 25, offset: 0 }) : Promise.resolve([]),
      ]);
      setRows(nextRows);
      setSummary(nextSummary);
      setCustomers(referenceData.customers);
      setCustomerBalance(balance);
      setPaymentHistory(history);
      setOffset(nextOffset);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "AR Aging could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  function resetFilters() {
    setAsOf("");
    setCustomerId("");
    setBucket("");
    setSearch("");
    void load(0, { asOf: "", customerId: "", bucket: "", search: "" });
  }

  useEffect(() => {
    void load(0);
    // Initial report load only; filters refresh explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      {message ? <Alert variant="error" title="AR Aging unavailable" message={message} /> : null}
      <Alert
        variant="info"
        title="Historical FX is not revalued"
        message="Customer Invoice and Order source documents do not currently store a transaction-time base-currency FX snapshot. AR totals are therefore shown by original currency instead of being converted with today's rate."
      />

      <ComponentCard title="AR Aging" desc="Read-only projection over Customer Invoices and the canonical F5A Customer Receipt reconciliation model.">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <Label htmlFor="ar-aging-as-of">Aging reference date</Label>
            <Input id="ar-aging-as-of" type="date" value={asOf} onChange={(event) => setAsOf(event.target.value)} />
            <p className={`mt-1 text-xs ${ADMIN_TEXT_STYLES.muted}`}>Reference date changes aging buckets only; it does not reconstruct a historical balance snapshot.</p>
          </div>
          <div>
            <Label htmlFor="ar-aging-customer">Customer</Label>
            <Select id="ar-aging-customer" options={customerOptions} value={customerId} onChange={setCustomerId} />
          </div>
          <div>
            <Label htmlFor="ar-aging-bucket">Aging bucket</Label>
            <Select id="ar-aging-bucket" options={bucketOptions} value={bucket} onChange={setBucket} />
          </div>
          <div>
            <Label htmlFor="ar-aging-search">Search</Label>
            <Input id="ar-aging-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Customer, invoice, order or project" />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => void load(0)} disabled={loading}>{loading ? "Refreshing…" : "Refresh Report"}</Button>
          <Button variant="outline" onClick={resetFilters} disabled={loading}>Reset Filters</Button>
        </div>
      </ComponentCard>

      <div className="grid gap-4 md:grid-cols-2">
        <ComponentCard title="Open AR" desc={`${summary?.open_invoice_count ?? 0} open invoice(s)`}>
          <div className={`text-sm ${ADMIN_TEXT_STYLES.muted}`}>Totals are grouped by invoice currency below.</div>
        </ComponentCard>
        <ComponentCard title="Overdue" desc={`${summary?.overdue_invoice_count ?? 0} overdue invoice(s)`}>
          <div className={`text-sm ${ADMIN_TEXT_STYLES.muted}`}>Aging reference: {summary?.as_of ? dateLabel(summary.as_of) : "current date"}.</div>
        </ComponentCard>
      </div>

      {currencies.length === 0 ? (
        <ComponentCard title="Currency Summary" desc="No open AR matches the current filters.">
          <div className={ADMIN_TEXT_STYLES.muted}>No outstanding Customer Invoice balance.</div>
        </ComponentCard>
      ) : currencies.map(([currency, totals]) => (
        <ComponentCard key={currency} title={`${currency} AR Summary`} desc="Original-currency totals; no live FX revaluation.">
          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <div><div className={`text-xs uppercase tracking-wide ${ADMIN_TEXT_STYLES.muted}`}>Open AR</div><div className={`text-lg font-semibold ${ADMIN_TEXT_STYLES.strong}`}>{money(totals.open_ar_amount, currency)}</div></div>
            <div><div className={`text-xs uppercase tracking-wide ${ADMIN_TEXT_STYLES.muted}`}>Overdue</div><div className={`text-lg font-semibold ${ADMIN_TEXT_STYLES.strong}`}>{money(totals.overdue_amount, currency)}</div></div>
            <div><div className={`text-xs uppercase tracking-wide ${ADMIN_TEXT_STYLES.muted}`}>Due Soon</div><div className={`text-lg font-semibold ${ADMIN_TEXT_STYLES.strong}`}>{money(totals.due_soon_amount, currency)}</div></div>
            {(Object.keys(bucketLabels) as ArAgingBucket[]).map((key) => (
              <div key={key}><div className={`text-xs uppercase tracking-wide ${ADMIN_TEXT_STYLES.muted}`}>{bucketLabels[key]}</div><div className={`text-lg font-semibold ${ADMIN_TEXT_STYLES.strong}`}>{money(totals.aging_buckets[key], currency)}</div></div>
            ))}
          </div>
        </ComponentCard>
      ))}

      <ComponentCard title="Open Customer Invoices" desc="Outstanding balance is Invoice total minus F5A-synchronized paid amount.">
        <TableViewport>
          <Table minWidth="wide">
            <TableHeader>
              <TableRow>
                <TableCell isHeader>Customer</TableCell>
                <TableCell isHeader>Invoice</TableCell>
                <TableCell isHeader>Order / Project</TableCell>
                <TableCell isHeader>Invoice Date</TableCell>
                <TableCell isHeader>Due</TableCell>
                <TableCell isHeader>Aging</TableCell>
                <TableCell isHeader>Total</TableCell>
                <TableCell isHeader>Paid</TableCell>
                <TableCell isHeader>Outstanding</TableCell>
                <TableCell isHeader>Status</TableCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? <TableStateRow colSpan={10}>Loading AR Aging…</TableStateRow> : rows.length === 0 ? <TableStateRow colSpan={10}>No open Customer Invoices match the current filters.</TableStateRow> : rows.map((row) => (
                <TableRow key={row.invoice_id}>
                  <TableCell><div className={`font-medium ${ADMIN_TEXT_STYLES.strong}`}>{row.customer_name}</div><div className={`text-xs ${ADMIN_TEXT_STYLES.muted}`}>{row.customer_code}</div></TableCell>
                  <TableCell><div className={`font-medium ${ADMIN_TEXT_STYLES.strong}`}>{row.invoice_number}</div>{row.customer_reference ? <div className={`text-xs ${ADMIN_TEXT_STYLES.muted}`}>{row.customer_reference}</div> : null}</TableCell>
                  <TableCell><div>{row.order_number || "—"}</div>{row.project_number ? <div className={`text-xs ${ADMIN_TEXT_STYLES.muted}`}>Project {row.project_number}</div> : null}</TableCell>
                  <TableCell>{dateLabel(row.invoice_date)}</TableCell>
                  <TableCell>{dateLabel(row.due_date)}</TableCell>
                  <TableCell><Badge color={bucketColor(row.aging_bucket)}>{bucketLabels[row.aging_bucket]}</Badge></TableCell>
                  <TableCell>{money(row.total_amount, row.currency_code)}</TableCell>
                  <TableCell>{money(row.paid_amount, row.currency_code)}</TableCell>
                  <TableCell><span className={`font-medium ${ADMIN_TEXT_STYLES.strong}`}>{money(row.outstanding_amount, row.currency_code)}</span></TableCell>
                  <TableCell>{row.status.replaceAll("_", " ")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableViewport>
        <div className="mt-4 flex items-center justify-between gap-3">
          <div className={`text-sm ${ADMIN_TEXT_STYLES.muted}`}>{totalCount ? `${offset + 1}–${Math.min(offset + pageSize, totalCount)} of ${totalCount}` : "0 results"}</div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={loading || offset === 0} onClick={() => void load(Math.max(0, offset - pageSize))}>Previous</Button>
            <Button variant="outline" size="sm" disabled={loading || offset + pageSize >= totalCount} onClick={() => void load(offset + pageSize)}>Next</Button>
          </div>
        </div>
      </ComponentCard>

      {customerId && customerBalance ? (
        <ComponentCard title="Customer Balance" desc={`${customerBalance.customer_code} · ${customerBalance.customer_name}`}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(customerBalance.currency_totals).map(([currency, totals]) => (
              <div key={currency}>
                <div className={`text-xs uppercase tracking-wide ${ADMIN_TEXT_STYLES.muted}`}>{currency} outstanding</div>
                <div className={`text-lg font-semibold ${ADMIN_TEXT_STYLES.strong}`}>{money(totals.open_ar_amount, currency)}</div>
                <div className={`text-xs ${ADMIN_TEXT_STYLES.muted}`}>{money(totals.overdue_amount, currency)} overdue</div>
              </div>
            ))}
          </div>
        </ComponentCard>
      ) : null}

      {customerId ? (
        <ComponentCard title="Customer Payment History" desc="Finance receipts are canonical. Legacy Project payments remain visible only while they are not explicitly bridged to Finance.">
          <TableViewport>
            <Table minWidth="wide">
              <TableHeader>
                <TableRow>
                  <TableCell isHeader>Date</TableCell>
                  <TableCell isHeader>Source</TableCell>
                  <TableCell isHeader>Event</TableCell>
                  <TableCell isHeader>Amount</TableCell>
                  <TableCell isHeader>Reference</TableCell>
                  <TableCell isHeader>Invoice Allocation</TableCell>
                  <TableCell isHeader>Status</TableCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? <TableStateRow colSpan={7}>Loading Customer Payment History…</TableStateRow> : paymentHistory.length === 0 ? <TableStateRow colSpan={7}>No Customer payment history found.</TableStateRow> : paymentHistory.map((payment) => (
                  <TableRow key={`${payment.source_kind}-${payment.source_id}`}>
                    <TableCell>{dateLabel(payment.transaction_at)}</TableCell>
                    <TableCell><Badge color={payment.source_kind === "finance_receipt" ? "success" : "warning"}>{sourceLabel(payment.source_kind)}</Badge></TableCell>
                    <TableCell>{payment.event_kind.replaceAll("_", " ")}</TableCell>
                    <TableCell><span className={`font-medium ${ADMIN_TEXT_STYLES.strong}`}>{money(payment.amount, payment.currency_code)}</span>{payment.base_amount !== null && payment.base_currency_code ? <div className={`text-xs ${ADMIN_TEXT_STYLES.muted}`}>{money(payment.base_amount, payment.base_currency_code)} base snapshot</div> : null}</TableCell>
                    <TableCell>{payment.reference_no || "—"}</TableCell>
                    <TableCell>{payment.invoice_allocations.length ? payment.invoice_allocations.map((allocation) => `${allocation.invoice_number || allocation.invoice_id}: ${money(allocation.amount, payment.currency_code)}`).join(" · ") : "—"}</TableCell>
                    <TableCell>{payment.status.replaceAll("_", " ")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableViewport>
        </ComponentCard>
      ) : null}
    </div>
  );
}
