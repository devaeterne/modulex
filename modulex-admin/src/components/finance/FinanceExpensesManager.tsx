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
import { getFinanceAccounts, getFinanceCategories, type FinanceAccount, type FinanceCategory } from "@/lib/finance/core";
import {
  createCompanyExpenseDraft,
  deleteCompanyExpenseDraft,
  getCompanyExpensesPage,
  postCompanyExpense,
  updateCompanyExpenseDraft,
  voidCompanyExpense,
  type CompanyExpense,
  type CompanyExpenseDraftInput,
  type CompanyExpenseStatus,
} from "@/lib/finance/expenses";

const statusOptions = [
  { value: "draft", label: "Draft" },
  { value: "posted", label: "Posted" },
  { value: "void", label: "Void" },
];

function todayValue() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function money(value: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(value || 0));
}

function statusColor(status: CompanyExpenseStatus) {
  if (status === "posted") return "success" as const;
  if (status === "void") return "error" as const;
  return "warning" as const;
}

export default function FinanceExpensesManager() {
  const [expenses, setExpenses] = useState<CompanyExpense[]>([]);
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ variant: "success" | "error"; text: string } | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [expenseDate, setExpenseDate] = useState(todayValue());
  const [categoryId, setCategoryId] = useState("");
  const [vendor, setVendor] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [currencyCode, setCurrencyCode] = useState("USD");
  const [sourceAccountId, setSourceAccountId] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [notes, setNotes] = useState("");

  const [manualFxRate, setManualFxRate] = useState("");
  const [manualFxSource, setManualFxSource] = useState("");
  const [voidReason, setVoidReason] = useState("");

  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [offset, setOffset] = useState(0);
  const pageSize = 50;

  async function load(nextOffset = offset) {
    setLoading(true);
    try {
      const profileResult = await getCurrentProfile();
      const nextCanManage = hasPermission(profileResult.profile?.roles, "finance.manage");
      const [nextAccounts, nextCategories, nextExpenses] = await Promise.all([
        getFinanceAccounts(),
        getFinanceCategories(),
        getCompanyExpensesPage({
          limit: pageSize,
          offset: nextOffset,
          status: (statusFilter || null) as CompanyExpenseStatus | null,
          categoryId: categoryFilter || null,
          search: search || null,
          from: fromDate || null,
          to: toDate || null,
        }),
      ]);
      setCanManage(nextCanManage);
      setAccounts(nextAccounts);
      setCategories(nextCategories);
      setExpenses(nextExpenses);
      setOffset(nextOffset);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(0).catch((error) => {
      setMessage({ variant: "error", text: error instanceof Error ? error.message : "Finance expenses could not be loaded." });
    });
    // Initial route load only; explicit Filter controls own later query refreshes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const accountOptions = useMemo(
    () => accounts
      .filter((account) => account.is_active)
      .map((account) => ({ value: account.id, label: `${account.name} · ${account.currency_code}` })),
    [accounts],
  );

  const categoryOptions = useMemo(
    () => categories
      .filter((category) => category.is_active && category.category_type === "expense")
      .map((category) => ({ value: category.id, label: `${category.code} · ${category.name}` })),
    [categories],
  );

  const totalCount = Number(expenses[0]?.total_count ?? 0);

  function chooseSourceAccount(value: string) {
    setSourceAccountId(value);
    const account = accounts.find((item) => item.id === value);
    if (account) setCurrencyCode(account.currency_code);
  }

  function resetDraftForm() {
    setEditingId(null);
    setExpenseDate(todayValue());
    setCategoryId("");
    setVendor("");
    setDescription("");
    setAmount("");
    setCurrencyCode("USD");
    setSourceAccountId("");
    setReferenceNo("");
    setNotes("");
  }

  function beginEdit(expense: CompanyExpense) {
    if (expense.status !== "draft") return;
    setEditingId(expense.id);
    setExpenseDate(expense.expense_date);
    setCategoryId(expense.finance_category_id);
    setVendor(expense.vendor ?? "");
    setDescription(expense.description);
    setAmount(String(expense.amount));
    setCurrencyCode(expense.currency_code);
    setSourceAccountId(expense.source_account_id ?? "");
    setReferenceNo(expense.reference_no ?? "");
    setNotes(expense.notes ?? "");
    setMessage(null);
  }

  function draftInput(): CompanyExpenseDraftInput | null {
    const numericAmount = Number(amount);
    if (!expenseDate || !categoryId || !sourceAccountId || !description.trim()) {
      setMessage({ variant: "error", text: "Date, category, source account and description are required." });
      return null;
    }
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setMessage({ variant: "error", text: "Expense amount must be greater than zero." });
      return null;
    }
    if (currencyCode.trim().length !== 3) {
      setMessage({ variant: "error", text: "Expense currency must be a 3-letter code." });
      return null;
    }
    return {
      expenseDate,
      financeCategoryId: categoryId,
      vendor,
      description,
      amount: numericAmount,
      currencyCode,
      sourceAccountId,
      referenceNo,
      notes,
    };
  }

  async function submitDraft(event: FormEvent) {
    event.preventDefault();
    if (!canManage || busyId) return;
    const input = draftInput();
    if (!input) return;

    setBusyId(editingId ?? "create");
    try {
      if (editingId) {
        await updateCompanyExpenseDraft(editingId, input);
        setMessage({ variant: "success", text: "Expense draft updated." });
      } else {
        await createCompanyExpenseDraft(input);
        setMessage({ variant: "success", text: "Expense draft created." });
      }
      resetDraftForm();
      await load(0);
    } catch (error) {
      setMessage({ variant: "error", text: error instanceof Error ? error.message : "Expense draft could not be saved." });
    } finally {
      setBusyId(null);
    }
  }

  async function deleteDraft(expense: CompanyExpense) {
    if (!canManage || busyId || expense.status !== "draft") return;
    setBusyId(expense.id);
    try {
      await deleteCompanyExpenseDraft(expense.id);
      if (editingId === expense.id) resetDraftForm();
      setMessage({ variant: "success", text: "Expense draft deleted." });
      await load(offset);
    } catch (error) {
      setMessage({ variant: "error", text: error instanceof Error ? error.message : "Expense draft could not be deleted." });
    } finally {
      setBusyId(null);
    }
  }

  async function postExpense(expense: CompanyExpense) {
    if (!canManage || busyId || expense.status !== "draft") return;
    const numericFxRate = manualFxRate.trim() ? Number(manualFxRate) : null;
    if (numericFxRate !== null && (!Number.isFinite(numericFxRate) || numericFxRate <= 0)) {
      setMessage({ variant: "error", text: "Manual FX rate must be greater than zero." });
      return;
    }
    if (numericFxRate !== null && !manualFxSource.trim()) {
      setMessage({ variant: "error", text: "Manual FX source is required when a manual FX rate is supplied." });
      return;
    }

    setBusyId(expense.id);
    try {
      await postCompanyExpense({
        expenseId: expense.id,
        manualFxRate: numericFxRate,
        manualFxRateSource: manualFxSource,
      });
      setMessage({ variant: "success", text: "Expense posted to Finance." });
      await load(offset);
    } catch (error) {
      setMessage({ variant: "error", text: error instanceof Error ? error.message : "Expense could not be posted." });
    } finally {
      setBusyId(null);
    }
  }

  async function voidExpense(expense: CompanyExpense) {
    if (!canManage || busyId || expense.status !== "posted") return;
    if (!voidReason.trim()) {
      setMessage({ variant: "error", text: "A void reason is required." });
      return;
    }

    setBusyId(expense.id);
    try {
      await voidCompanyExpense(expense.id, voidReason);
      setVoidReason("");
      setMessage({ variant: "success", text: "Expense voided through Finance." });
      await load(offset);
    } catch (error) {
      setMessage({ variant: "error", text: error instanceof Error ? error.message : "Expense could not be voided." });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      {message ? (
        <Alert
          variant={message.variant}
          title={message.variant === "success" ? "Finance expense saved" : "Finance expense error"}
          message={message.text}
        />
      ) : null}

      {!canManage && !loading ? (
        <Alert
          variant="info"
          title="Read-only Finance access"
          message="Your role can review company expenses but cannot create, edit, post, delete or void them."
        />
      ) : null}

      {canManage ? (
        <ComponentCard
          title={editingId ? "Edit Expense Draft" : "New Expense Draft"}
          desc="Company expense is the source document; posting creates the canonical Finance money movement."
        >
          <form onSubmit={submitDraft} className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div>
                <Label htmlFor="expense-date">Expense date</Label>
                <Input id="expense-date" type="date" value={expenseDate} onChange={(event) => setExpenseDate(event.target.value)} required />
              </div>
              <div>
                <Label htmlFor="expense-category">Category</Label>
                <Select id="expense-category" options={categoryOptions} value={categoryId} onChange={setCategoryId} placeholder="Select expense category" required />
              </div>
              <div>
                <Label htmlFor="expense-account">Source account</Label>
                <Select id="expense-account" options={accountOptions} value={sourceAccountId} onChange={chooseSourceAccount} placeholder="Select cash or bank account" required />
              </div>
              <div>
                <Label htmlFor="expense-amount">Amount</Label>
                <Input id="expense-amount" type="number" min="0.0001" step="0.0001" value={amount} onChange={(event) => setAmount(event.target.value)} required />
              </div>
              <div>
                <Label htmlFor="expense-currency">Currency</Label>
                <Input id="expense-currency" value={currencyCode} maxLength={3} onChange={(event) => setCurrencyCode(event.target.value.toUpperCase())} required />
              </div>
              <div>
                <Label htmlFor="expense-vendor">Vendor / payee</Label>
                <Input id="expense-vendor" value={vendor} onChange={(event) => setVendor(event.target.value)} />
              </div>
              <div>
                <Label htmlFor="expense-reference">Reference</Label>
                <Input id="expense-reference" value={referenceNo} onChange={(event) => setReferenceNo(event.target.value)} />
              </div>
              <div>
                <Label htmlFor="expense-description">Description</Label>
                <Input id="expense-description" value={description} onChange={(event) => setDescription(event.target.value)} required />
              </div>
            </div>
            <div>
              <Label htmlFor="expense-notes">Notes</Label>
              <TextArea id="expense-notes" value={notes} onChange={setNotes} rows={3} />
            </div>
            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={Boolean(busyId)}>{editingId ? "Update Draft" : "Create Draft"}</Button>
              {editingId ? <Button variant="outline" disabled={Boolean(busyId)} onClick={resetDraftForm}>Cancel Edit</Button> : null}
            </div>
          </form>
        </ComponentCard>
      ) : null}

      {canManage ? (
        <ComponentCard title="Posting & Correction Inputs" desc="Optional manual FX applies only when needed. Posted expenses require a reason before voiding.">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <Label htmlFor="expense-fx-rate">Manual FX rate</Label>
              <Input id="expense-fx-rate" type="number" min="0.0000000001" step="0.0000000001" value={manualFxRate} onChange={(event) => setManualFxRate(event.target.value)} />
            </div>
            <div>
              <Label htmlFor="expense-fx-source">Manual FX source</Label>
              <Input id="expense-fx-source" value={manualFxSource} onChange={(event) => setManualFxSource(event.target.value)} />
            </div>
            <div>
              <Label htmlFor="expense-void-reason">Void reason</Label>
              <Input id="expense-void-reason" value={voidReason} onChange={(event) => setVoidReason(event.target.value)} />
            </div>
          </div>
        </ComponentCard>
      ) : null}

      <ComponentCard title="Expense Ledger" desc="One ledger across all years; filter by date, lifecycle status, category or text.">
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <div>
              <Label htmlFor="expense-filter-status">Status</Label>
              <Select id="expense-filter-status" options={statusOptions} value={statusFilter} onChange={setStatusFilter} placeholder="All statuses" allowEmpty />
            </div>
            <div>
              <Label htmlFor="expense-filter-category">Category</Label>
              <Select id="expense-filter-category" options={categoryOptions} value={categoryFilter} onChange={setCategoryFilter} placeholder="All categories" allowEmpty />
            </div>
            <div>
              <Label htmlFor="expense-filter-from">From</Label>
              <Input id="expense-filter-from" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
            </div>
            <div>
              <Label htmlFor="expense-filter-to">To</Label>
              <Input id="expense-filter-to" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
            </div>
            <div>
              <Label htmlFor="expense-filter-search">Search</Label>
              <Input id="expense-filter-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Description, vendor, reference" />
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" disabled={loading || Boolean(busyId)} onClick={() => void load(0).catch((error) => setMessage({ variant: "error", text: error instanceof Error ? error.message : "Expense filters could not be applied." }))}>Apply Filters</Button>
            <Button variant="ghost" disabled={loading || Boolean(busyId)} onClick={() => void load(offset).catch((error) => setMessage({ variant: "error", text: error instanceof Error ? error.message : "Finance expenses could not be refreshed." }))}>Retry / Refresh</Button>
          </div>

          <TableViewport>
            <Table variant="admin" minWidth="wide">
              <TableHeader variant="admin">
                <TableRow>
                  <TableCell isHeader variant="admin">Date</TableCell>
                  <TableCell isHeader variant="admin">Expense</TableCell>
                  <TableCell isHeader variant="admin">Category</TableCell>
                  <TableCell isHeader variant="admin">Account</TableCell>
                  <TableCell isHeader variant="admin" className="text-right">Amount</TableCell>
                  <TableCell isHeader variant="admin">Status</TableCell>
                  <TableCell isHeader variant="admin">Actions</TableCell>
                </TableRow>
              </TableHeader>
              <TableBody variant="admin">
                {loading ? (
                  <TableStateRow colSpan={7}>Loading Finance expenses…</TableStateRow>
                ) : expenses.length === 0 ? (
                  <TableStateRow colSpan={7}>No Finance expenses match the current filters.</TableStateRow>
                ) : expenses.map((expense) => (
                  <TableRow key={expense.id}>
                    <TableCell variant="admin">{expense.expense_date}</TableCell>
                    <TableCell variant="admin">
                      <span className="font-medium">{expense.description}</span>
                      <div className="text-xs">{expense.vendor || "No vendor"}{expense.reference_no ? ` · ${expense.reference_no}` : ""}</div>
                    </TableCell>
                    <TableCell variant="admin">{expense.category_name}</TableCell>
                    <TableCell variant="admin">{expense.source_account_name || "—"}</TableCell>
                    <TableCell variant="admin" className="text-right font-medium">{money(expense.amount, expense.currency_code)}</TableCell>
                    <TableCell variant="admin"><Badge color={statusColor(expense.status)}>{expense.status}</Badge></TableCell>
                    <TableCell variant="admin">
                      {canManage ? (
                        <div className="flex flex-wrap gap-2">
                          {expense.status === "draft" ? (
                            <>
                              <Button size="sm" variant="outline" disabled={Boolean(busyId)} onClick={() => beginEdit(expense)}>Edit</Button>
                              <Button size="sm" disabled={Boolean(busyId)} onClick={() => void postExpense(expense)}>Post</Button>
                              <Button size="sm" variant="danger" disabled={Boolean(busyId)} onClick={() => void deleteDraft(expense)}>Delete</Button>
                            </>
                          ) : null}
                          {expense.status === "posted" ? (
                            <Button size="sm" variant="danger" disabled={Boolean(busyId)} onClick={() => void voidExpense(expense)}>Void</Button>
                          ) : null}
                          {expense.status === "void" ? "—" : null}
                        </div>
                      ) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableViewport>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm">Showing {expenses.length} of {totalCount} expenses</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={loading || offset === 0} onClick={() => void load(Math.max(0, offset - pageSize))}>Previous</Button>
              <Button variant="outline" size="sm" disabled={loading || offset + expenses.length >= totalCount} onClick={() => void load(offset + pageSize)}>Next</Button>
            </div>
          </div>
        </div>
      </ComponentCard>
    </div>
  );
}
