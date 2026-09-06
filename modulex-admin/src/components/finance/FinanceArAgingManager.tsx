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
  getCustomerBalancesPage,
  getCustomerInvoiceBalancePage,
  getCustomerPaymentHistoryPage,
  type ArAgingBucket,
  type ArAgingRow,
  type ArAgingSummary,
  type CustomerBalanceRow,
  type CustomerBalanceState,
  type CustomerInvoiceBalanceRow,
  type CustomerPaymentHistoryRow,
  type InvoiceBalanceState,
} from "@/lib/finance/arAging";
import {
  getCustomerReceiptReferenceData,
  type CustomerReceiptCustomerOption,
} from "@/lib/finance/customer-receipts";

const pageSize = 50;

const bucketOptions = [
  { value: "", label: "All aging buckets" },
  { value: "current", label: "Current" },
  { value: "1_30", label: "1–30 days" },
  { value: "31_60", label: "31–60 days" },
  { value: "61_90", label: "61–90 days" },
  { value: "90_plus", label: "90+ days" },
];

const balanceStateOptions = [
  { value: "all", label: "All customers" },
  { value: "open", label: "Open balance" },
  { value: "overdue", label: "Overdue" },
  { value: "partial", label: "Partially paid" },
  { value: "paid", label: "Fully paid only" },
];

const invoiceStateOptions = [
  { value: "all", label: "All invoices" },
  { value: "open", label: "Open invoices" },
  { value: "paid", label: "Paid invoices" },
];

const bucketLabels: Record<ArAgingBucket, string> = {
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

function dateLabel(value: string | null) {
  if (!value) return "—";
  const normalized = value.length > 10 ? value : `${value.slice(0, 10)}T12:00:00`;
  return new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric" }).format(new Date(normalized));
}

function bucketColor(bucket: ArAgingBucket | null) {
  if (!bucket || bucket === "current") return "success" as const;
  if (bucket === "1_30") return "warning" as const;
  return "error" as const;
}

function paymentColor(state: string) {
  if (state === "paid" || state === "posted") return "success" as const;
  if (state === "partial" || state === "draft") return "warning" as const;
  if (state === "voided") return "error" as const;
  return "light" as const;
}

function currencyBalanceLabel(row: { currency_code: string; outstanding_amount: number }) {
  return money(row.outstanding_amount, row.currency_code);
}

export default function FinanceArAgingManager() {
  const [customers, setCustomers] = useState<CustomerReceiptCustomerOption[]>([]);
  const [agingRows, setAgingRows] = useState<ArAgingRow[]>([]);
  const [summary, setSummary] = useState<ArAgingSummary | null>(null);
  const [balanceRows, setBalanceRows] = useState<CustomerBalanceRow[]>([]);
  const [historyRows, setHistoryRows] = useState<CustomerPaymentHistoryRow[]>([]);
  const [invoiceRows, setInvoiceRows] = useState<CustomerInvoiceBalanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [asOf, setAsOf] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [bucket, setBucket] = useState("");
  const [search, setSearch] = useState("");
  const [agingOffset, setAgingOffset] = useState(0);

  const [balanceState, setBalanceState] = useState<CustomerBalanceState>("all");
  const [balanceSearch, setBalanceSearch] = useState("");
  const [balanceOffset, setBalanceOffset] = useState(0);

  const [historySearch, setHistorySearch] = useState("");
  const [historyOffset, setHistoryOffset] = useState(0);

  const [selectedCustomer, setSelectedCustomer] = useState<CustomerBalanceRow | null>(null);
  const [invoiceState, setInvoiceState] = useState<InvoiceBalanceState>("all");
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [invoiceOffset, setInvoiceOffset] = useState(0);

  const customerOptions = useMemo(
    () => [
      { value: "", label: "All customers" },
      ...customers.map((customer) => ({ value: customer.id, label: `${customer.customer_code} · ${customer.name}` })),
    ],
    [customers],
  );

  const agingTotal = Number(agingRows[0]?.total_count ?? 0);
  const balanceTotal = Number(balanceRows[0]?.total_count ?? 0);
  const historyTotal = Number(historyRows[0]?.total_count ?? 0);
  const invoiceTotal = Number(invoiceRows[0]?.total_count ?? 0);
  const baseCurrency = summary?.base_currency_code ?? "USD";

  async function loadAging(nextOffset = agingOffset, overrides?: { asOf?: string; customerId?: string; bucket?: string; search?: string }) {
    const nextAsOf = overrides?.asOf ?? asOf;
    const nextCustomerId = overrides?.customerId ?? customerId;
    const nextBucket = overrides?.bucket ?? bucket;
    const nextSearch = overrides?.search ?? search;
    const [nextSummary, nextRows] = await Promise.all([
      getArAgingSummary({ asOf: nextAsOf || null, customerId: nextCustomerId || null }),
      getArAgingPage({
        asOf: nextAsOf || null,
        limit: pageSize,
        offset: nextOffset,
        customerId: nextCustomerId || null,
        bucket: (nextBucket || null) as ArAgingBucket | null,
        search: nextSearch,
      }),
    ]);
    setSummary(nextSummary);
    setAgingRows(nextRows);
    setAgingOffset(nextOffset);
  }

  async function loadBalances(nextOffset = balanceOffset, overrides?: { state?: CustomerBalanceState; search?: string; asOf?: string }) {
    const nextState = overrides?.state ?? balanceState;
    const nextSearch = overrides?.search ?? balanceSearch;
    const nextAsOf = overrides?.asOf ?? asOf;
    const rows = await getCustomerBalancesPage({
      asOf: nextAsOf || null,
      limit: pageSize,
      offset: nextOffset,
      state: nextState,
      search: nextSearch,
    });
    setBalanceRows(rows);
    setBalanceOffset(nextOffset);
  }

  async function loadHistory(nextOffset = historyOffset, overrides?: { customerId?: string; search?: string }) {
    const nextCustomerId = overrides?.customerId ?? customerId;
    const nextSearch = overrides?.search ?? historySearch;
    const rows = await getCustomerPaymentHistoryPage({
      limit: pageSize,
      offset: nextOffset,
      customerId: nextCustomerId || null,
      search: nextSearch,
    });
    setHistoryRows(rows);
    setHistoryOffset(nextOffset);
  }

  async function loadInvoiceDetail(customer: CustomerBalanceRow, nextOffset = invoiceOffset, overrides?: { state?: InvoiceBalanceState; search?: string; asOf?: string }) {
    setDetailLoading(true);
    setMessage(null);
    try {
      const rows = await getCustomerInvoiceBalancePage({
        customerId: customer.customer_id,
        asOf: (overrides?.asOf ?? asOf) || null,
        limit: pageSize,
        offset: nextOffset,
        balanceState: overrides?.state ?? invoiceState,
        search: overrides?.search ?? invoiceSearch,
      });
      setSelectedCustomer(customer);
      setInvoiceRows(rows);
      setInvoiceOffset(nextOffset);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Customer Invoice balances could not be loaded.");
    } finally {
      setDetailLoading(false);
    }
  }

  async function refreshAll() {
    setLoading(true);
    setMessage(null);
    try {
      const reference = await getCustomerReceiptReferenceData();
      setCustomers(reference.customers);
      await Promise.all([loadAging(0), loadBalances(0), loadHistory(0)]);
      if (selectedCustomer) await loadInvoiceDetail(selectedCustomer, 0);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "AR reporting could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  function resetAgingFilters() {
    setAsOf("");
    setCustomerId("");
    setBucket("");
    setSearch("");
    setHistorySearch("");
    setSelectedCustomer(null);
    setInvoiceRows([]);
    void Promise.all([
      loadAging(0, { asOf: "", customerId: "", bucket: "", search: "" }),
      loadBalances(0, { asOf: "" }),
      loadHistory(0, { customerId: "", search: "" }),
    ]).catch((error) => setMessage(error instanceof Error ? error.message : "AR filters could not be reset."));
  }

  async function applyTopFilters() {
    setLoading(true);
    setMessage(null);
    try {
      await Promise.all([loadAging(0), loadBalances(0, { asOf }), loadHistory(0)]);
      if (selectedCustomer) await loadInvoiceDetail(selectedCustomer, 0, { asOf });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "AR filters could not be applied.");
    } finally {
      setLoading(false);
    }
  }

  async function focusCustomer(row: CustomerBalanceRow) {
    setCustomerId(row.customer_id);
    setHistoryOffset(0);
    setHistorySearch("");
    setInvoiceState("all");
    setInvoiceSearch("");
    setLoading(true);
    setMessage(null);
    try {
      await Promise.all([
        loadAging(0, { customerId: row.customer_id }),
        loadHistory(0, { customerId: row.customer_id, search: "" }),
        loadInvoiceDetail(row, 0, { state: "all", search: "" }),
      ]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Customer account could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshAll();
    // Initial report load only; filters refresh explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasUnconverted = Boolean(summary && summary.unconverted_invoice_count > 0);

  return (
    <div className="space-y-6">
      {message ? <Alert variant="error" title="AR reporting unavailable" message={message} /> : null}
      {hasUnconverted ? (
        <Alert
          variant="warning"
          title="Main-currency conversion incomplete"
          message={`${summary?.unconverted_invoice_count ?? 0} open Invoice(s) use a non-base currency without an Invoice-owned historical FX snapshot. Their source-currency balance is preserved, while affected base-currency aggregates are unavailable rather than guessed.`}
        />
      ) : null}

      <ComponentCard title="AR Aging" desc="Finance-derived receivables projection over Customer Invoices, posted Customer Receipts, corrections and compatible Project payment allocations.">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <Label htmlFor="ar-aging-as-of">As of date</Label>
            <Input id="ar-aging-as-of" type="date" value={asOf} onChange={(event) => setAsOf(event.target.value)} />
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
            <Input id="ar-aging-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Customer, invoice or order" />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => void applyTopFilters()} disabled={loading}>{loading ? "Refreshing…" : "Refresh Report"}</Button>
          <Button variant="outline" onClick={resetAgingFilters} disabled={loading}>Reset Filters</Button>
        </div>
      </ComponentCard>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <ComponentCard title="Open AR" desc={`${summary?.open_invoice_count ?? 0} open invoice(s)`}>
          <div className={`text-xl font-semibold ${ADMIN_TEXT_STYLES.strong}`}>{summary ? money(summary.open_ar_base_amount, baseCurrency) : "—"}</div>
        </ComponentCard>
        <ComponentCard title="Overdue" desc={`${summary?.overdue_invoice_count ?? 0} overdue invoice(s)`}>
          <div className={`text-xl font-semibold ${ADMIN_TEXT_STYLES.strong}`}>{summary ? money(summary.overdue_base_amount, baseCurrency) : "—"}</div>
        </ComponentCard>
        <ComponentCard title="Partial" desc="Partially paid open invoices">
          <div className={`text-xl font-semibold ${ADMIN_TEXT_STYLES.strong}`}>{summary?.partial_invoice_count ?? 0}</div>
        </ComponentCard>
        <ComponentCard title="Customers" desc="Customers with an open receivable">
          <div className={`text-xl font-semibold ${ADMIN_TEXT_STYLES.strong}`}>{summary?.customer_count ?? 0}</div>
        </ComponentCard>
        <ComponentCard title="Unconverted" desc="Open foreign-currency invoices without an Invoice FX snapshot">
          <div className={`text-xl font-semibold ${ADMIN_TEXT_STYLES.strong}`}>{summary?.unconverted_invoice_count ?? 0}</div>
        </ComponentCard>
      </div>

      <ComponentCard title="Aging Buckets" desc={`Main-currency open receivable as of ${summary?.as_of ? dateLabel(summary.as_of) : "current date"}.`}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {(Object.keys(bucketLabels) as ArAgingBucket[]).map((key) => (
            <div key={key} className="space-y-1">
              <div className={`text-xs font-medium uppercase tracking-wide ${ADMIN_TEXT_STYLES.muted}`}>{bucketLabels[key]}</div>
              <div className={`text-lg font-semibold ${ADMIN_TEXT_STYLES.strong}`}>{summary ? money(summary.aging_buckets[key], baseCurrency) : "—"}</div>
            </div>
          ))}
        </div>
        {summary?.currency_balances?.length ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {summary.currency_balances.map((row) => <Badge key={row.currency_code} color="light">{row.currency_code}: {currencyBalanceLabel(row)}</Badge>)}
          </div>
        ) : null}
      </ComponentCard>

      <ComponentCard title="Open Customer Invoices" desc="Outstanding is reconciled from posted Finance receipt allocations plus unbridged legacy Project allocations; Finance-bridged Project cash is excluded from the Project component.">
        <TableViewport>
          <Table minWidth="wide">
            <TableHeader>
              <TableRow>
                <TableCell isHeader>Customer</TableCell>
                <TableCell isHeader>Invoice</TableCell>
                <TableCell isHeader>Due</TableCell>
                <TableCell isHeader>Aging</TableCell>
                <TableCell isHeader>Paid</TableCell>
                <TableCell isHeader>Outstanding</TableCell>
                <TableCell isHeader>Base Outstanding</TableCell>
                <TableCell isHeader>Settlement Sources</TableCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? <TableStateRow colSpan={8}>Loading AR Aging…</TableStateRow> : agingRows.length === 0 ? <TableStateRow colSpan={8}>No open Customer Invoices match the current filters.</TableStateRow> : agingRows.map((row) => (
                <TableRow key={row.invoice_id}>
                  <TableCell><div className={`font-medium ${ADMIN_TEXT_STYLES.strong}`}>{row.customer_name}</div><div className={`text-xs ${ADMIN_TEXT_STYLES.muted}`}>{row.customer_code}</div></TableCell>
                  <TableCell><div className={`font-medium ${ADMIN_TEXT_STYLES.strong}`}>{row.invoice_number}</div>{row.order_number ? <div className={`text-xs ${ADMIN_TEXT_STYLES.muted}`}>Order {row.order_number}</div> : null}</TableCell>
                  <TableCell>{dateLabel(row.due_date)}</TableCell>
                  <TableCell><Badge color={bucketColor(row.aging_bucket)}>{bucketLabels[row.aging_bucket]}</Badge></TableCell>
                  <TableCell>{money(row.paid_amount, row.currency_code)} <Badge color={paymentColor(row.payment_state)}>{row.payment_state}</Badge></TableCell>
                  <TableCell>{money(row.outstanding_amount, row.currency_code)}</TableCell>
                  <TableCell>{row.unconverted ? <Badge color="warning">Unconverted</Badge> : money(row.base_outstanding_amount, row.base_currency_code)}</TableCell>
                  <TableCell><div>Finance {money(row.finance_paid_amount, row.currency_code)}</div><div className={`text-xs ${ADMIN_TEXT_STYLES.muted}`}>Project compatibility {money(row.project_paid_amount, row.currency_code)}</div></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableViewport>
        <div className="mt-4 flex items-center justify-between gap-3">
          <div className={`text-sm ${ADMIN_TEXT_STYLES.muted}`}>{agingTotal} open invoice(s)</div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => void loadAging(Math.max(0, agingOffset - pageSize)).catch((error) => setMessage(error.message))} disabled={loading || agingOffset === 0}>Previous</Button>
            <Button size="sm" variant="outline" onClick={() => void loadAging(agingOffset + pageSize).catch((error) => setMessage(error.message))} disabled={loading || agingOffset + pageSize >= agingTotal}>Next</Button>
          </div>
        </div>
      </ComponentCard>

      <ComponentCard title="Customer Balance" desc="Customer-level balance rollup is calculated from the same Invoice settlement projection; it does not maintain a separate receivable balance field.">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div>
            <Label htmlFor="customer-balance-state">Balance state</Label>
            <Select id="customer-balance-state" options={balanceStateOptions} value={balanceState} onChange={(value) => setBalanceState(value as CustomerBalanceState)} />
          </div>
          <div>
            <Label htmlFor="customer-balance-search">Search</Label>
            <Input id="customer-balance-search" value={balanceSearch} onChange={(event) => setBalanceSearch(event.target.value)} placeholder="Customer name or code" />
          </div>
          <div className="flex items-end">
            <Button onClick={() => void loadBalances(0).catch((error) => setMessage(error.message))} disabled={loading}>Apply Balance Filters</Button>
          </div>
        </div>
        <div className="mt-4">
          <TableViewport>
            <Table minWidth="wide">
              <TableHeader>
                <TableRow>
                  <TableCell isHeader>Customer</TableCell>
                  <TableCell isHeader>Open</TableCell>
                  <TableCell isHeader>Overdue</TableCell>
                  <TableCell isHeader>Partial</TableCell>
                  <TableCell isHeader>Paid</TableCell>
                  <TableCell isHeader>Outstanding</TableCell>
                  <TableCell isHeader>Currency Balances</TableCell>
                  <TableCell isHeader>Action</TableCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? <TableStateRow colSpan={8}>Loading Customer Balance…</TableStateRow> : balanceRows.length === 0 ? <TableStateRow colSpan={8}>No Customer Balance rows match the filters.</TableStateRow> : balanceRows.map((row) => (
                  <TableRow key={row.customer_id}>
                    <TableCell><div className={`font-medium ${ADMIN_TEXT_STYLES.strong}`}>{row.customer_name}</div><div className={`text-xs ${ADMIN_TEXT_STYLES.muted}`}>{row.customer_code}</div></TableCell>
                    <TableCell>{row.open_invoice_count}</TableCell>
                    <TableCell>{row.overdue_invoice_count}</TableCell>
                    <TableCell>{row.partial_invoice_count}</TableCell>
                    <TableCell>{row.paid_invoice_count}</TableCell>
                    <TableCell>{row.unconverted_invoice_count > 0 ? <Badge color="warning">Mixed / unconverted</Badge> : money(row.outstanding_base_amount, row.base_currency_code)}</TableCell>
                    <TableCell>{row.currency_balances.filter((item) => Number(item.outstanding_amount) > 0).map((item) => <div key={item.currency_code}>{item.currency_code} {currencyBalanceLabel(item)}</div>)}</TableCell>
                    <TableCell><Button size="sm" variant="outline" onClick={() => void focusCustomer(row)} disabled={detailLoading}>View Account</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableViewport>
          <div className="mt-4 flex items-center justify-between gap-3">
            <div className={`text-sm ${ADMIN_TEXT_STYLES.muted}`}>{balanceTotal} customer account(s)</div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => void loadBalances(Math.max(0, balanceOffset - pageSize)).catch((error) => setMessage(error.message))} disabled={loading || balanceOffset === 0}>Previous</Button>
              <Button size="sm" variant="outline" onClick={() => void loadBalances(balanceOffset + pageSize).catch((error) => setMessage(error.message))} disabled={loading || balanceOffset + pageSize >= balanceTotal}>Next</Button>
            </div>
          </div>
        </div>
      </ComponentCard>

      {selectedCustomer ? (
        <ComponentCard title={`Invoice Balance · ${selectedCustomer.customer_name}`} desc="Invoice-level paid/outstanding projection, including fully paid history without changing Invoice source truth.">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div>
              <Label htmlFor="invoice-balance-state">Invoice state</Label>
              <Select id="invoice-balance-state" options={invoiceStateOptions} value={invoiceState} onChange={(value) => setInvoiceState(value as InvoiceBalanceState)} />
            </div>
            <div>
              <Label htmlFor="invoice-balance-search">Search invoices</Label>
              <Input id="invoice-balance-search" value={invoiceSearch} onChange={(event) => setInvoiceSearch(event.target.value)} placeholder="Invoice or order" />
            </div>
            <div className="flex items-end">
              <Button onClick={() => void loadInvoiceDetail(selectedCustomer, 0)} disabled={detailLoading}>{detailLoading ? "Loading…" : "Apply Invoice Filters"}</Button>
            </div>
          </div>
          <div className="mt-4">
            <TableViewport>
              <Table minWidth="wide">
                <TableHeader>
                  <TableRow>
                    <TableCell isHeader>Invoice</TableCell>
                    <TableCell isHeader>Date</TableCell>
                    <TableCell isHeader>Due</TableCell>
                    <TableCell isHeader>Status</TableCell>
                    <TableCell isHeader>Paid</TableCell>
                    <TableCell isHeader>Outstanding</TableCell>
                    <TableCell isHeader>Finance</TableCell>
                    <TableCell isHeader>Project Compatibility</TableCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detailLoading ? <TableStateRow colSpan={8}>Loading Invoice balances…</TableStateRow> : invoiceRows.length === 0 ? <TableStateRow colSpan={8}>No invoices match this Customer account filter.</TableStateRow> : invoiceRows.map((row) => (
                    <TableRow key={row.invoice_id}>
                      <TableCell><div className={`font-medium ${ADMIN_TEXT_STYLES.strong}`}>{row.invoice_number}</div>{row.order_number ? <div className={`text-xs ${ADMIN_TEXT_STYLES.muted}`}>Order {row.order_number}</div> : null}</TableCell>
                      <TableCell>{dateLabel(row.invoice_date)}</TableCell>
                      <TableCell>{dateLabel(row.due_date)}</TableCell>
                      <TableCell><Badge color={paymentColor(row.payment_state)}>{row.payment_state}</Badge>{row.aging_bucket ? <div className="mt-1"><Badge color={bucketColor(row.aging_bucket)}>{bucketLabels[row.aging_bucket]}</Badge></div> : null}</TableCell>
                      <TableCell>{money(row.paid_amount, row.currency_code)}</TableCell>
                      <TableCell>{money(row.outstanding_amount, row.currency_code)}</TableCell>
                      <TableCell>{money(row.finance_paid_amount, row.currency_code)}</TableCell>
                      <TableCell>{money(row.project_paid_amount, row.currency_code)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableViewport>
            <div className="mt-4 flex items-center justify-between gap-3">
              <div className={`text-sm ${ADMIN_TEXT_STYLES.muted}`}>{invoiceTotal} invoice(s)</div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => void loadInvoiceDetail(selectedCustomer, Math.max(0, invoiceOffset - pageSize))} disabled={detailLoading || invoiceOffset === 0}>Previous</Button>
                <Button size="sm" variant="outline" onClick={() => void loadInvoiceDetail(selectedCustomer, invoiceOffset + pageSize)} disabled={detailLoading || invoiceOffset + pageSize >= invoiceTotal}>Next</Button>
              </div>
            </div>
          </div>
        </ComponentCard>
      ) : null}

      <ComponentCard title="Customer Payment History" desc="Canonical Finance Customer Receipts and correction events. A bridged Project payment is attribution on the Finance event, never a second cash row.">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div>
            <Label htmlFor="payment-history-customer">Customer</Label>
            <Select id="payment-history-customer" options={customerOptions} value={customerId} onChange={setCustomerId} />
          </div>
          <div>
            <Label htmlFor="payment-history-search">Search</Label>
            <Input id="payment-history-search" value={historySearch} onChange={(event) => setHistorySearch(event.target.value)} placeholder="Customer, reference or invoice" />
          </div>
          <div className="flex items-end">
            <Button onClick={() => void loadHistory(0).catch((error) => setMessage(error.message))} disabled={loading}>Apply History Filters</Button>
          </div>
        </div>
        <div className="mt-4">
          <TableViewport>
            <Table minWidth="wide">
              <TableHeader>
                <TableRow>
                  <TableCell isHeader>Customer</TableCell>
                  <TableCell isHeader>Event</TableCell>
                  <TableCell isHeader>Date</TableCell>
                  <TableCell isHeader>Amount</TableCell>
                  <TableCell isHeader>Effective</TableCell>
                  <TableCell isHeader>Base Effective</TableCell>
                  <TableCell isHeader>Invoices</TableCell>
                  <TableCell isHeader>Account</TableCell>
                  <TableCell isHeader>Project Bridge</TableCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? <TableStateRow colSpan={9}>Loading Customer Payment History…</TableStateRow> : historyRows.length === 0 ? <TableStateRow colSpan={9}>No Customer Receipt history matches the current filters.</TableStateRow> : historyRows.map((row) => (
                  <TableRow key={row.transaction_id}>
                    <TableCell><div className={`font-medium ${ADMIN_TEXT_STYLES.strong}`}>{row.customer_name ?? "Customer"}</div><div className={`text-xs ${ADMIN_TEXT_STYLES.muted}`}>{row.customer_code ?? row.customer_id}</div></TableCell>
                    <TableCell><Badge color={row.event_type === "reversal" ? "error" : "primary"}>{row.event_type}</Badge> <Badge color={paymentColor(row.status)}>{row.status}</Badge>{row.reference_no ? <div className={`mt-1 text-xs ${ADMIN_TEXT_STYLES.muted}`}>{row.reference_no}</div> : null}</TableCell>
                    <TableCell>{dateLabel(row.transaction_at)}</TableCell>
                    <TableCell>{money(row.amount, row.currency_code)}</TableCell>
                    <TableCell>{money(row.effective_amount, row.currency_code)}</TableCell>
                    <TableCell>{money(row.effective_base_amount, row.base_currency_code)}</TableCell>
                    <TableCell>{row.invoice_count}<div className={`text-xs ${ADMIN_TEXT_STYLES.muted}`}>{row.invoice_numbers ?? "Unallocated"}</div></TableCell>
                    <TableCell>{row.destination_account_name ?? "—"}</TableCell>
                    <TableCell>{row.project_bridged ? <Badge color="info">Bridged</Badge> : <Badge color="light">Finance only</Badge>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableViewport>
          <div className="mt-4 flex items-center justify-between gap-3">
            <div className={`text-sm ${ADMIN_TEXT_STYLES.muted}`}>{historyTotal} Finance payment event(s)</div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => void loadHistory(Math.max(0, historyOffset - pageSize)).catch((error) => setMessage(error.message))} disabled={loading || historyOffset === 0}>Previous</Button>
              <Button size="sm" variant="outline" onClick={() => void loadHistory(historyOffset + pageSize).catch((error) => setMessage(error.message))} disabled={loading || historyOffset + pageSize >= historyTotal}>Next</Button>
            </div>
          </div>
        </div>
      </ComponentCard>
    </div>
  );
}
