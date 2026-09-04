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
  createFinanceTransactionDraft,
  deleteFinanceTransactionDraft,
  getFinanceAccounts,
  getFinanceCategories,
  getFinanceEmployeeDirectory,
  getFinanceEmployeePayrollItems,
  getFinanceTransactionsPage,
  postFinanceTransaction,
  reverseFinanceTransaction,
  setFinanceTransactionLinks,
  voidFinanceTransaction,
  type FinanceAccount,
  type FinanceCategory,
  type FinanceEmployeeOption,
  type FinancePayrollItemOption,
  type FinanceTransaction,
  type FinanceTransactionKind,
  type FinanceTransactionStatus,
} from "@/lib/finance/core";

const kindOptions = [
  { value: "customer_receipt", label: "Customer receipt" },
  { value: "vendor_payment", label: "Vendor payment" },
  { value: "employee_payment", label: "Employee payment" },
  { value: "deposit", label: "Deposit" },
  { value: "withdrawal", label: "Withdrawal" },
  { value: "transfer", label: "Transfer" },
  { value: "refund", label: "Refund" },
];

const statusFilterOptions = [
  { value: "draft", label: "Draft" },
  { value: "posted", label: "Posted" },
  { value: "voided", label: "Voided" },
];

const kindFilterOptions = [
  { value: "expense", label: "Expense" },
  ...kindOptions,
  { value: "reversal", label: "Reversal" },
];

function localDateTimeValue() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function statusColor(status: FinanceTransactionStatus) {
  if (status === "posted") return "success" as const;
  if (status === "voided") return "error" as const;
  return "warning" as const;
}

function money(value: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(value || 0));
}

export default function FinanceTransactionsManager() {
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([]);
  const [employees, setEmployees] = useState<FinanceEmployeeOption[]>([]);
  const [payrollItems, setPayrollItems] = useState<FinancePayrollItemOption[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ variant: "success" | "error"; text: string } | null>(null);

  const [kind, setKind] = useState<FinanceTransactionKind>("customer_receipt");
  const [sourceAccountId, setSourceAccountId] = useState("");
  const [destinationAccountId, setDestinationAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [payrollItemId, setPayrollItemId] = useState("");
  const [amount, setAmount] = useState("");
  const [currencyCode, setCurrencyCode] = useState("USD");
  const [transactionAt, setTransactionAt] = useState(localDateTimeValue());
  const [referenceNo, setReferenceNo] = useState("");
  const [notes, setNotes] = useState("");

  const [postFxRate, setPostFxRate] = useState("");
  const [postFxSource, setPostFxSource] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [kindFilter, setKindFilter] = useState("");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const pageSize = 50;

  async function load(nextOffset = offset) {
    const profileResult = await getCurrentProfile();
    const nextCanManage = hasPermission(profileResult.profile?.roles, "finance.manage");
    const [nextAccounts, nextCategories, nextTransactions, nextEmployees] = await Promise.all([
      getFinanceAccounts(),
      getFinanceCategories(),
      getFinanceTransactionsPage({
        limit: pageSize,
        offset: nextOffset,
        status: (statusFilter || null) as FinanceTransactionStatus | null,
        kind: (kindFilter || null) as FinanceTransactionKind | null,
        search: search || null,
      }),
      nextCanManage ? getFinanceEmployeeDirectory() : Promise.resolve([] as FinanceEmployeeOption[]),
    ]);
    setAccounts(nextAccounts);
    setCategories(nextCategories);
    setTransactions(nextTransactions);
    setEmployees(nextEmployees);
    setCanManage(nextCanManage);
    setOffset(nextOffset);
  }

  useEffect(() => {
    void load(0).catch((error) => setMessage({ variant: "error", text: error instanceof Error ? error.message : "Finance transactions could not be loaded." }));
    // Initial route load only; explicit Filter controls own later query refreshes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (kind !== "employee_payment" || !employeeId || !canManage) {
      setPayrollItems([]);
      setPayrollItemId("");
      return;
    }
    void getFinanceEmployeePayrollItems(employeeId)
      .then((items) => {
        setPayrollItems(items);
        if (payrollItemId && !items.some((item) => item.payroll_item_id === payrollItemId)) setPayrollItemId("");
      })
      .catch((error) => setMessage({ variant: "error", text: error instanceof Error ? error.message : "Payroll items could not be loaded." }));
  }, [canManage, employeeId, kind, payrollItemId]);

  const activeAccounts = useMemo(() => accounts.filter((account) => account.is_active), [accounts]);
  const accountOptions = useMemo(() => activeAccounts.map((account) => ({ value: account.id, label: `${account.name} · ${account.currency_code}` })), [activeAccounts]);
  const destinationOptions = useMemo(() => activeAccounts.filter((account) => !sourceAccountId || account.currency_code === currencyCode).map((account) => ({ value: account.id, label: `${account.name} · ${account.currency_code}` })), [activeAccounts, sourceAccountId, currencyCode]);
  const categoryOptions = useMemo(() => categories.filter((category) => category.is_active && (kind !== "expense" || category.category_type === "expense")).map((category) => ({ value: category.id, label: `${category.code} · ${category.name}` })), [categories, kind]);
  const employeeOptions = useMemo(() => employees.map((employee) => ({ value: employee.employee_id, label: `${employee.full_name} · ${employee.employee_number}${employee.employment_status === "active" ? "" : ` · ${employee.employment_status}`}` })), [employees]);
  const payrollItemOptions = useMemo(() => payrollItems.map((item) => ({ value: item.payroll_item_id, label: `${item.period_code} · Pay ${item.pay_date} · ${money(item.remaining_amount, currencyCode)} remaining` })), [currencyCode, payrollItems]);
  const totalCount = Number(transactions[0]?.total_count ?? 0);

  function chooseKind(value: string) {
    const nextKind = value as FinanceTransactionKind;
    setKind(nextKind);
    if (nextKind !== "expense") setCategoryId("");
    if (nextKind !== "employee_payment") {
      setEmployeeId("");
      setPayrollItemId("");
      setPayrollItems([]);
    } else {
      setDestinationAccountId("");
    }
  }

  function chooseSource(value: string) {
    setSourceAccountId(value);
    const account = accounts.find((item) => item.id === value);
    if (account) setCurrencyCode(account.currency_code);
  }

  function chooseDestination(value: string) {
    setDestinationAccountId(value);
    const account = accounts.find((item) => item.id === value);
    if (!sourceAccountId && account) setCurrencyCode(account.currency_code);
  }

  function chooseEmployee(value: string) {
    setEmployeeId(value);
    setPayrollItemId("");
    setPayrollItems([]);
  }

  function choosePayrollItem(value: string) {
    setPayrollItemId(value);
    const item = payrollItems.find((payrollItem) => payrollItem.payroll_item_id === value);
    if (item) setAmount(String(item.remaining_amount));
  }

  async function createDraft(event: FormEvent) {
    event.preventDefault();
    if (!canManage || busyId) return;
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setMessage({ variant: "error", text: "Finance amount must be greater than zero." });
      return;
    }
    if (kind === "employee_payment" && !employeeId) {
      setMessage({ variant: "error", text: "Employee is required for an employee payment." });
      return;
    }
    const selectedPayrollItem = payrollItems.find((item) => item.payroll_item_id === payrollItemId);
    if (selectedPayrollItem && numericAmount > Number(selectedPayrollItem.remaining_amount)) {
      setMessage({ variant: "error", text: "Finance amount cannot exceed the Payroll Item remaining amount." });
      return;
    }

    setBusyId("create");
    let createdTransactionId: string | null = null;
    try {
      createdTransactionId = await createFinanceTransactionDraft({
        transactionKind: kind,
        sourceAccountId: sourceAccountId || null,
        destinationAccountId: destinationAccountId || null,
        categoryId: categoryId || null,
        amount: numericAmount,
        currencyCode,
        transactionAt: new Date(transactionAt).toISOString(),
        referenceNo,
        notes,
      });

      if (kind === "employee_payment") {
        await setFinanceTransactionLinks(createdTransactionId, [{
          employee_id: employeeId,
          source_document_type: payrollItemId ? "hr_payroll_item" : null,
          source_document_id: payrollItemId || null,
          allocated_amount: numericAmount,
        }]);
      }

      setAmount("");
      setReferenceNo("");
      setNotes("");
      setEmployeeId("");
      setPayrollItemId("");
      setPayrollItems([]);
      setMessage({ variant: "success", text: kind === "employee_payment" ? "Employee Finance draft created and linked. It does not affect Payroll settlement until posted." : "Finance draft created. It does not affect balances until posted." });
      await load(0);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Finance draft could not be created.";
      setMessage({ variant: "error", text: createdTransactionId ? `Finance draft ${createdTransactionId} was created, but its Employee/Payroll link failed: ${detail}. Delete the draft before retrying.` : detail });
    } finally {
      setBusyId(null);
    }
  }

  async function deleteDraft(transaction: FinanceTransaction) {
    if (!canManage || busyId || transaction.status !== "draft") return;
    if (!window.confirm("Delete this Finance draft? This action is only available before posting.")) return;
    setBusyId(transaction.id);
    try {
      await deleteFinanceTransactionDraft(transaction.id);
      setMessage({ variant: "success", text: "Finance draft deleted. No posted money history was changed." });
      await load(offset);
    } catch (error) {
      setMessage({ variant: "error", text: error instanceof Error ? error.message : "Finance draft could not be deleted." });
    } finally {
      setBusyId(null);
    }
  }

  async function post(transaction: FinanceTransaction) {
    if (!canManage || busyId) return;
    setBusyId(transaction.id);
    try {
      const numericFx = postFxRate.trim() ? Number(postFxRate) : null;
      if (numericFx !== null && (!Number.isFinite(numericFx) || numericFx <= 0)) throw new Error("Manual FX rate must be greater than zero.");
      if (numericFx !== null && !postFxSource.trim()) throw new Error("Manual FX source/reason is required when overriding the rate.");
      await postFinanceTransaction({ transactionId: transaction.id, manualFxRate: numericFx, manualFxRateSource: numericFx === null ? null : postFxSource });
      setMessage({ variant: "success", text: transaction.transaction_kind === "employee_payment" ? "Employee payment posted. Personnel/Payroll settlement now reads this Finance movement." : "Finance transaction posted. Its base-currency snapshot is now immutable." });
      await load(offset);
    } catch (error) {
      setMessage({ variant: "error", text: error instanceof Error ? error.message : "Finance transaction could not be posted." });
    } finally {
      setBusyId(null);
    }
  }

  async function voidTransaction(transaction: FinanceTransaction) {
    if (!canManage || busyId) return;
    if (!correctionReason.trim()) {
      setMessage({ variant: "error", text: "Enter a correction reason before voiding a Finance transaction." });
      return;
    }
    if (!window.confirm("Void this posted Finance transaction?")) return;
    setBusyId(transaction.id);
    try {
      await voidFinanceTransaction(transaction.id, correctionReason);
      setMessage({ variant: "success", text: "Finance transaction voided with an audit reason." });
      await load(offset);
    } catch (error) {
      setMessage({ variant: "error", text: error instanceof Error ? error.message : "Finance transaction could not be voided." });
    } finally {
      setBusyId(null);
    }
  }

  async function reverse(transaction: FinanceTransaction) {
    if (!canManage || busyId) return;
    if (!correctionReason.trim()) {
      setMessage({ variant: "error", text: "Enter a correction reason before reversing a Finance transaction." });
      return;
    }
    if (!window.confirm("Create a full compensating reversal for this Finance transaction?")) return;
    setBusyId(transaction.id);
    try {
      await reverseFinanceTransaction(transaction.id, correctionReason);
      setMessage({ variant: "success", text: "Compensating Finance reversal posted." });
      await load(offset);
    } catch (error) {
      setMessage({ variant: "error", text: error instanceof Error ? error.message : "Finance transaction could not be reversed." });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      {message ? <Alert variant={message.variant} title={message.variant === "success" ? "Finance updated" : "Finance error"} message={message.text} /> : null}

      {canManage ? (
        <ComponentCard title="New Finance Draft" desc="Drafts are editable working records and do not affect account balances until posted.">
          <form onSubmit={createDraft} className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div><Label htmlFor="finance-kind">Transaction type</Label><Select id="finance-kind" options={kindOptions} value={kind} onChange={chooseKind} /></div>
            <div><Label htmlFor="finance-amount">Amount</Label><Input id="finance-amount" type="number" min="0.0001" step="0.0001" value={amount} onChange={(event) => setAmount(event.target.value)} required /></div>
            <div><Label htmlFor="finance-currency">Currency</Label><Input id="finance-currency" value={currencyCode} maxLength={3} onChange={(event) => setCurrencyCode(event.target.value.toUpperCase())} required /></div>
            <div><Label htmlFor="finance-at">Transaction time</Label><Input id="finance-at" type="datetime-local" value={transactionAt} onChange={(event) => setTransactionAt(event.target.value)} required /></div>
            <div><Label htmlFor="finance-source">Source account</Label><Select id="finance-source" options={accountOptions} value={sourceAccountId} allowEmpty placeholder="No source account" onChange={chooseSource} /></div>
            <div><Label htmlFor="finance-destination">Destination account</Label><Select id="finance-destination" options={destinationOptions} value={destinationAccountId} allowEmpty placeholder="No destination account" onChange={chooseDestination} /></div>
            <div><Label htmlFor="finance-category">Category</Label><Select id="finance-category" options={categoryOptions} value={categoryId} allowEmpty placeholder="Optional category" onChange={setCategoryId} /></div>
            <div><Label htmlFor="finance-reference">Reference</Label><Input id="finance-reference" value={referenceNo} onChange={(event) => setReferenceNo(event.target.value)} /></div>
            {kind === "employee_payment" ? (
              <>
                <div><Label htmlFor="finance-employee">Employee</Label><Select id="finance-employee" options={employeeOptions} value={employeeId} placeholder="Select Employee" onChange={chooseEmployee} /></div>
                <div className="md:col-span-2 xl:col-span-3"><Label htmlFor="finance-payroll-item">Payroll Item (optional salary allocation)</Label><Select id="finance-payroll-item" options={payrollItemOptions} value={payrollItemId} allowEmpty placeholder={employeeId ? "No Payroll Item / other employee payment" : "Select Employee first"} onChange={choosePayrollItem} /></div>
                <div className="md:col-span-2 xl:col-span-4"><Alert variant="info" title="Single payment record" message="This creates only one Finance payment. If a Payroll Item is selected, Personnel/Payroll derives Finance Paid, Remaining and payment status from the posted Finance history." /></div>
              </>
            ) : null}
            <div className="md:col-span-2 xl:col-span-4"><Label htmlFor="finance-notes">Notes</Label><TextArea id="finance-notes" value={notes} onChange={setNotes} rows={2} /></div>
            <div><Button type="submit" disabled={Boolean(busyId)}>Save Draft</Button></div>
          </form>
        </ComponentCard>
      ) : (
        <Alert variant="info" title="Read-only Finance access" message="Your role can review Finance transactions but cannot create, delete, post, void or reverse them." />
      )}

      {canManage ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <ComponentCard title="Posting FX Override" desc="Leave blank to use the latest eligible saved FX observation at or before the transaction time.">
            <div className="grid gap-4 md:grid-cols-2">
              <div><Label htmlFor="finance-post-fx">Manual FX rate</Label><Input id="finance-post-fx" type="number" min="0.0000000001" step="0.0000000001" value={postFxRate} onChange={(event) => setPostFxRate(event.target.value)} /></div>
              <div><Label htmlFor="finance-post-fx-source">Manual rate source / agreement</Label><Input id="finance-post-fx-source" value={postFxSource} onChange={(event) => setPostFxSource(event.target.value)} /></div>
            </div>
          </ComponentCard>
          <ComponentCard title="Correction Reason" desc="Required before a posted transaction can be voided or reversed.">
            <div><Label htmlFor="finance-correction-reason">Reason</Label><Input id="finance-correction-reason" value={correctionReason} onChange={(event) => setCorrectionReason(event.target.value)} /></div>
          </ComponentCard>
        </div>
      ) : null}

      <ComponentCard title="Transactions" desc="Posted rows are immutable money history. Drafts can be deleted before posting; voids and reversals remain visible for audit.">
        <div className="grid gap-4 md:grid-cols-4">
          <div><Label htmlFor="finance-status-filter">Status</Label><Select id="finance-status-filter" options={statusFilterOptions} value={statusFilter} allowEmpty placeholder="All statuses" onChange={setStatusFilter} /></div>
          <div><Label htmlFor="finance-kind-filter">Type</Label><Select id="finance-kind-filter" options={kindFilterOptions} value={kindFilter} allowEmpty placeholder="All transaction types" onChange={setKindFilter} /></div>
          <div><Label htmlFor="finance-search">Search</Label><Input id="finance-search" value={search} placeholder="Reference or notes" onChange={(event) => setSearch(event.target.value)} /></div>
          <div className="flex items-end"><Button variant="outline" onClick={() => void load(0)} disabled={Boolean(busyId)}>Apply Filters</Button></div>
        </div>

        <TableViewport>
          <Table variant="admin" minWidth="extraWide">
            <TableHeader variant="admin"><TableRow><TableCell isHeader variant="admin">Date</TableCell><TableCell isHeader variant="admin">Type</TableCell><TableCell isHeader variant="admin">Accounts</TableCell><TableCell isHeader variant="admin">Reference</TableCell><TableCell isHeader variant="admin" className="text-right">Amount</TableCell><TableCell isHeader variant="admin" className="text-right">Base amount</TableCell><TableCell isHeader variant="admin">Status</TableCell><TableCell isHeader variant="admin">Actions</TableCell></TableRow></TableHeader>
            <TableBody variant="admin">
              {transactions.length === 0 ? <TableStateRow colSpan={8}>No Finance transactions match this view.</TableStateRow> : transactions.map((transaction) => (
                <TableRow key={transaction.id}>
                  <TableCell variant="admin">{new Date(transaction.transaction_at).toLocaleString()}</TableCell>
                  <TableCell variant="admin">{transaction.transaction_kind.replaceAll("_", " ")}</TableCell>
                  <TableCell variant="admin"><div>{transaction.source_account_name ? `From: ${transaction.source_account_name}` : ""}</div><div>{transaction.destination_account_name ? `To: ${transaction.destination_account_name}` : ""}</div></TableCell>
                  <TableCell variant="admin">{transaction.reference_no || "—"}</TableCell>
                  <TableCell variant="admin" className="text-right font-medium">{money(transaction.amount, transaction.currency_code)}</TableCell>
                  <TableCell variant="admin" className="text-right">{transaction.base_amount !== null && transaction.base_currency_code ? money(transaction.base_amount, transaction.base_currency_code) : "—"}</TableCell>
                  <TableCell variant="admin"><Badge color={statusColor(transaction.status)}>{transaction.status}</Badge></TableCell>
                  <TableCell variant="admin">
                    {canManage ? (
                      <div className="flex flex-wrap gap-2">
                        {transaction.status === "draft" ? <Button size="sm" onClick={() => void post(transaction)} disabled={Boolean(busyId)}>Post</Button> : null}
                        {transaction.status === "draft" ? <Button size="sm" variant="danger" onClick={() => void deleteDraft(transaction)} disabled={Boolean(busyId)}>Delete Draft</Button> : null}
                        {transaction.status === "posted" && transaction.transaction_kind !== "reversal" ? <Button size="sm" variant="outline" onClick={() => void voidTransaction(transaction)} disabled={Boolean(busyId)}>Void</Button> : null}
                        {transaction.status === "posted" ? <Button size="sm" variant="danger" onClick={() => void reverse(transaction)} disabled={Boolean(busyId)}>Reverse</Button> : null}
                        {transaction.status === "voided" ? "—" : null}
                      </div>
                    ) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableViewport>

        <div className="flex items-center justify-between gap-3">
          <p className="text-sm">{totalCount} transaction(s)</p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={offset === 0 || Boolean(busyId)} onClick={() => void load(Math.max(0, offset - pageSize))}>Previous</Button>
            <Button size="sm" variant="outline" disabled={offset + pageSize >= totalCount || Boolean(busyId)} onClick={() => void load(offset + pageSize)}>Next</Button>
          </div>
        </div>
      </ComponentCard>
    </div>
  );
}