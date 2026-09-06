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
  getCustomerReceiptInvoices,
  getCustomerReceiptReferenceData,
  getCustomerReceiptsPage,
  recordCustomerReceipt,
  reverseCustomerReceipt,
  voidCustomerReceipt,
  type CustomerReceiptInvoice,
  type CustomerReceiptReferenceData,
  type CustomerReceiptRow,
} from "@/lib/finance/customer-receipts";

function localDateTimeValue() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function money(value: string | number | null | undefined, currency: string) {
  const amount = Number(value ?? 0);
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number.isFinite(amount) ? amount : 0);
  } catch {
    return `${currency} ${Number.isFinite(amount) ? amount.toFixed(2) : "0.00"}`;
  }
}

function statusColor(status: string) {
  if (status === "posted") return "success" as const;
  if (status === "voided") return "error" as const;
  return "warning" as const;
}

export default function FinanceCustomerReceiptsManager() {
  const [referenceData, setReferenceData] = useState<CustomerReceiptReferenceData>({ customers: [], accounts: [] });
  const [invoices, setInvoices] = useState<CustomerReceiptInvoice[]>([]);
  const [receipts, setReceipts] = useState<CustomerReceiptRow[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [destinationAccountId, setDestinationAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [currencyCode, setCurrencyCode] = useState("USD");
  const [transactionAt, setTransactionAt] = useState(localDateTimeValue());
  const [referenceNo, setReferenceNo] = useState("");
  const [notes, setNotes] = useState("");
  const [manualFxRate, setManualFxRate] = useState("");
  const [manualFxSource, setManualFxSource] = useState("");
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [correctionReason, setCorrectionReason] = useState("");
  const [filterCustomerId, setFilterCustomerId] = useState("");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ variant: "success" | "error" | "info"; text: string } | null>(null);
  const pageSize = 50;

  async function load(nextOffset = offset) {
    const [profileResult, nextReference, nextReceipts] = await Promise.all([
      getCurrentProfile(),
      getCustomerReceiptReferenceData(),
      getCustomerReceiptsPage({
        limit: pageSize,
        offset: nextOffset,
        customerId: filterCustomerId || null,
        search: search || null,
      }),
    ]);
    if (profileResult.error) throw profileResult.error;
    setCanManage(hasPermission(profileResult.profile?.roles, "finance.manage"));
    setReferenceData(nextReference);
    setReceipts(nextReceipts);
    setOffset(nextOffset);
  }

  useEffect(() => {
    void load(0).catch((error) => setMessage({ variant: "error", text: error instanceof Error ? error.message : "Customer Receipts could not be loaded." }));
    // Initial route load only; filters use explicit Apply.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!customerId) {
      setInvoices([]);
      setAllocations({});
      return;
    }
    const customer = referenceData.customers.find((item) => item.id === customerId);
    if (customer) setCurrencyCode(customer.currency_code || "USD");
    setDestinationAccountId("");
    setAllocations({});
    void getCustomerReceiptInvoices(customerId)
      .then(setInvoices)
      .catch((error) => setMessage({ variant: "error", text: error instanceof Error ? error.message : "Open Invoices could not be loaded." }));
  }, [customerId, referenceData.customers]);

  const customerOptions = useMemo(
    () => referenceData.customers.map((customer) => ({ value: customer.id, label: `${customer.customer_code} · ${customer.name}` })),
    [referenceData.customers],
  );
  const accountOptions = useMemo(
    () => referenceData.accounts
      .filter((account) => account.currency_code === currencyCode)
      .map((account) => ({ value: account.id, label: `${account.name} · ${account.currency_code}` })),
    [currencyCode, referenceData.accounts],
  );
  const selectedAllocations = useMemo(
    () => invoices.flatMap((invoice) => {
      const value = allocations[invoice.invoice_id]?.trim();
      return value ? [{ invoiceId: invoice.invoice_id, amount: value }] : [];
    }),
    [allocations, invoices],
  );
  const allocationPreview = useMemo(
    () => selectedAllocations.reduce((sum, allocation) => sum + (Number(allocation.amount) || 0), 0),
    [selectedAllocations],
  );
  const totalCount = Number(receipts[0]?.total_count ?? 0);

  function setInvoiceAllocation(invoiceId: string, value: string) {
    setAllocations((current) => ({ ...current, [invoiceId]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canManage || busyId) return;
    if (!customerId || !destinationAccountId) {
      setMessage({ variant: "error", text: "Customer and destination Cash/Bank account are required." });
      return;
    }
    if (selectedAllocations.length === 0) {
      setMessage({ variant: "error", text: "Add at least one Invoice allocation." });
      return;
    }

    setBusyId("record");
    try {
      await recordCustomerReceipt({
        customerId,
        destinationAccountId,
        amount,
        currencyCode,
        transactionAt: new Date(transactionAt).toISOString(),
        referenceNo,
        notes,
        invoiceAllocations: selectedAllocations,
        manualFxRate: manualFxRate || null,
        manualFxRateSource: manualFxSource,
      });
      setAmount("");
      setReferenceNo("");
      setNotes("");
      setManualFxRate("");
      setManualFxSource("");
      setAllocations({});
      setInvoices(await getCustomerReceiptInvoices(customerId));
      setMessage({ variant: "success", text: "Customer Receipt posted and Invoice balances reconciled atomically." });
      await load(0);
    } catch (error) {
      setMessage({ variant: "error", text: error instanceof Error ? error.message : "Customer Receipt could not be posted." });
    } finally {
      setBusyId(null);
    }
  }

  async function correct(receipt: CustomerReceiptRow, mode: "void" | "reverse") {
    if (!canManage || busyId) return;
    if (!correctionReason.trim()) {
      setMessage({ variant: "error", text: "Enter a correction reason before voiding or reversing a Customer Receipt." });
      return;
    }
    if (!window.confirm(mode === "void" ? "Void this Customer Receipt?" : "Post a full compensating reversal for this Customer Receipt?")) return;
    setBusyId(receipt.transaction_id);
    try {
      if (mode === "void") await voidCustomerReceipt(receipt.transaction_id, correctionReason);
      else await reverseCustomerReceipt(receipt.transaction_id, correctionReason);
      setMessage({ variant: "success", text: mode === "void" ? "Customer Receipt voided and Invoice balances recalculated." : "Customer Receipt reversal posted and Invoice balances recalculated." });
      if (customerId) setInvoices(await getCustomerReceiptInvoices(customerId));
      await load(offset);
    } catch (error) {
      setMessage({ variant: "error", text: error instanceof Error ? error.message : "Customer Receipt correction failed." });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      {message ? <Alert variant={message.variant} title={message.variant === "error" ? "Customer Receipt error" : "Customer Receipts"} message={message.text} /> : null}

      {canManage ? (
        <ComponentCard title="Record Customer Receipt" desc="Post customer cash into Finance and allocate the same amount to open Invoices in one transaction.">
          <form onSubmit={submit} className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div><Label htmlFor="receipt-customer">Customer</Label><Select id="receipt-customer" options={customerOptions} value={customerId} placeholder="Select Customer" onChange={setCustomerId} /></div>
              <div><Label htmlFor="receipt-account">Destination Cash / Bank</Label><Select id="receipt-account" options={accountOptions} value={destinationAccountId} placeholder={customerId ? `Select ${currencyCode} account` : "Select Customer first"} onChange={setDestinationAccountId} /></div>
              <div><Label htmlFor="receipt-amount">Receipt amount</Label><Input id="receipt-amount" type="number" min="0.0001" step="0.0001" value={amount} onChange={(event) => setAmount(event.target.value)} required /></div>
              <div><Label htmlFor="receipt-at">Receipt time</Label><Input id="receipt-at" type="datetime-local" value={transactionAt} onChange={(event) => setTransactionAt(event.target.value)} required /></div>
              <div><Label htmlFor="receipt-reference">Reference</Label><Input id="receipt-reference" value={referenceNo} onChange={(event) => setReferenceNo(event.target.value)} /></div>
              <div><Label htmlFor="receipt-fx">Manual FX rate</Label><Input id="receipt-fx" type="number" min="0.0000000001" step="0.0000000001" value={manualFxRate} onChange={(event) => setManualFxRate(event.target.value)} /></div>
              <div className="md:col-span-2"><Label htmlFor="receipt-fx-source">Manual FX source / agreement</Label><Input id="receipt-fx-source" value={manualFxSource} onChange={(event) => setManualFxSource(event.target.value)} /></div>
              <div className="md:col-span-2 xl:col-span-4"><Label htmlFor="receipt-notes">Notes</Label><TextArea id="receipt-notes" value={notes} onChange={setNotes} rows={2} /></div>
            </div>

            <ComponentCard title="Invoice allocations" desc={`Allocated preview: ${money(allocationPreview, currencyCode)} · Receipt: ${money(amount || 0, currencyCode)}`}>
              <TableViewport>
                <Table variant="admin" minWidth="wide">
                  <TableHeader variant="admin"><TableRow><TableCell isHeader variant="admin">Invoice</TableCell><TableCell isHeader variant="admin">Due</TableCell><TableCell isHeader variant="admin" className="text-right">Total</TableCell><TableCell isHeader variant="admin" className="text-right">Paid</TableCell><TableCell isHeader variant="admin" className="text-right">Balance</TableCell><TableCell isHeader variant="admin">Allocation</TableCell></TableRow></TableHeader>
                  <TableBody variant="admin">
                    {!customerId ? <TableStateRow colSpan={6}>Select a Customer to load open Invoices.</TableStateRow> : invoices.length === 0 ? <TableStateRow colSpan={6}>No open Invoices are available for this Customer.</TableStateRow> : invoices.map((invoice) => (
                      <TableRow key={invoice.invoice_id}>
                        <TableCell variant="admin"><div className="font-medium">{invoice.invoice_number}</div><div className="text-xs">{invoice.status.replaceAll("_", " ")}{invoice.legacy_unreconciled ? " · legacy payment reconciliation required" : ""}</div></TableCell>
                        <TableCell variant="admin">{invoice.due_date || "—"}</TableCell>
                        <TableCell variant="admin" className="text-right">{money(invoice.total_amount, invoice.currency_code)}</TableCell>
                        <TableCell variant="admin" className="text-right">{money(invoice.paid_amount, invoice.currency_code)}</TableCell>
                        <TableCell variant="admin" className="text-right font-medium">{money(invoice.balance_amount, invoice.currency_code)}</TableCell>
                        <TableCell variant="admin"><Input type="number" min="0" step="0.0001" max={String(invoice.balance_amount)} disabled={invoice.legacy_unreconciled} value={allocations[invoice.invoice_id] || ""} onChange={(event) => setInvoiceAllocation(invoice.invoice_id, event.target.value)} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableViewport>
            </ComponentCard>

            <div><Button type="submit" disabled={Boolean(busyId)}>Post Customer Receipt</Button></div>
          </form>
        </ComponentCard>
      ) : (
        <Alert variant="info" title="Read-only Finance access" message="Your role can review Customer Receipts but cannot post, void or reverse them." />
      )}

      {canManage ? (
        <ComponentCard title="Correction Reason" desc="Required for void or full compensating reversal. Posted Finance history is never edited in place.">
          <div className="max-w-2xl"><Label htmlFor="receipt-correction-reason">Reason</Label><Input id="receipt-correction-reason" value={correctionReason} onChange={(event) => setCorrectionReason(event.target.value)} /></div>
        </ComponentCard>
      ) : null}

      <ComponentCard title="Customer Receipt History" desc="Posted receipts remain auditable; Invoice balances follow posted allocations, voids and reversals.">
        <div className="grid gap-4 md:grid-cols-3">
          <div><Label htmlFor="receipt-filter-customer">Customer</Label><Select id="receipt-filter-customer" options={customerOptions} value={filterCustomerId} allowEmpty placeholder="All Customers" onChange={setFilterCustomerId} /></div>
          <div><Label htmlFor="receipt-search">Search</Label><Input id="receipt-search" value={search} placeholder="Customer or reference" onChange={(event) => setSearch(event.target.value)} /></div>
          <div className="flex items-end"><Button variant="outline" onClick={() => void load(0)} disabled={Boolean(busyId)}>Apply Filters</Button></div>
        </div>

        <TableViewport>
          <Table variant="admin" minWidth="extraWide">
            <TableHeader variant="admin"><TableRow><TableCell isHeader variant="admin">Date</TableCell><TableCell isHeader variant="admin">Customer</TableCell><TableCell isHeader variant="admin">Account</TableCell><TableCell isHeader variant="admin">Reference</TableCell><TableCell isHeader variant="admin" className="text-right">Amount</TableCell><TableCell isHeader variant="admin">Invoices</TableCell><TableCell isHeader variant="admin">Status</TableCell><TableCell isHeader variant="admin">Actions</TableCell></TableRow></TableHeader>
            <TableBody variant="admin">
              {receipts.length === 0 ? <TableStateRow colSpan={8}>No Customer Receipts match this view.</TableStateRow> : receipts.map((receipt) => (
                <TableRow key={receipt.transaction_id}>
                  <TableCell variant="admin">{new Date(receipt.transaction_at).toLocaleString()}</TableCell>
                  <TableCell variant="admin"><div className="font-medium">{receipt.customer_name || "Unknown Customer"}</div><div className="text-xs">{receipt.customer_code || "—"}</div></TableCell>
                  <TableCell variant="admin">{receipt.destination_account_name || "—"}</TableCell>
                  <TableCell variant="admin">{receipt.reference_no || "—"}</TableCell>
                  <TableCell variant="admin" className="text-right font-medium">{money(receipt.amount, receipt.currency_code)}</TableCell>
                  <TableCell variant="admin">{receipt.invoice_count} · {money(receipt.allocated_amount, receipt.currency_code)}</TableCell>
                  <TableCell variant="admin"><Badge color={statusColor(receipt.status)}>{receipt.status}</Badge>{receipt.reversal_transaction_id ? <div className="mt-1 text-xs">Reversed</div> : null}</TableCell>
                  <TableCell variant="admin">
                    {canManage && receipt.status === "posted" && !receipt.reversal_transaction_id ? (
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" disabled={Boolean(busyId)} onClick={() => void correct(receipt, "void")}>Void</Button>
                        <Button size="sm" variant="danger" disabled={Boolean(busyId)} onClick={() => void correct(receipt, "reverse")}>Reverse</Button>
                      </div>
                    ) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableViewport>

        <div className="flex items-center justify-between gap-3">
          <p className="text-sm">{totalCount} receipt(s)</p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={offset === 0 || Boolean(busyId)} onClick={() => void load(Math.max(0, offset - pageSize))}>Previous</Button>
            <Button size="sm" variant="outline" disabled={offset + pageSize >= totalCount || Boolean(busyId)} onClick={() => void load(offset + pageSize)}>Next</Button>
          </div>
        </div>
      </ComponentCard>
    </div>
  );
}
