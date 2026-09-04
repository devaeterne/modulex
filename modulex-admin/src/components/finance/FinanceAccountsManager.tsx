"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import ComponentCard from "@/components/common/ComponentCard";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import Select from "@/components/form/Select";
import { Table, TableBody, TableCell, TableHeader, TableRow, TableStateRow, TableViewport } from "@/components/ui/table";
import { hasPermission } from "@/lib/auth/permissions";
import { getCurrentProfile } from "@/lib/supabase/profile";
import {
  createFinanceAccount,
  createFinanceCategory,
  getFinanceAccounts,
  getFinanceCategories,
  getFinanceFxRates,
  updateFinanceAccount,
  upsertFinanceFxRate,
  type FinanceAccount,
  type FinanceAccountType,
  type FinanceCategory,
  type FinanceCategoryType,
  type FinanceFxRate,
} from "@/lib/finance/core";

const accountTypeOptions = [
  { value: "bank", label: "Bank" },
  { value: "cash", label: "Cash" },
  { value: "clearing", label: "Clearing" },
];

const categoryTypeOptions = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
];

function localDateTimeValue() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function money(value: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(value || 0));
}

export default function FinanceAccountsManager() {
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [rates, setRates] = useState<FinanceFxRate[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ variant: "success" | "error"; text: string } | null>(null);

  const [accountCode, setAccountCode] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountType, setAccountType] = useState<FinanceAccountType>("bank");
  const [accountCurrency, setAccountCurrency] = useState("USD");
  const [institutionName, setInstitutionName] = useState("");
  const [accountReference, setAccountReference] = useState("");

  const [categoryCode, setCategoryCode] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [categoryType, setCategoryType] = useState<FinanceCategoryType>("expense");

  const [fromCurrency, setFromCurrency] = useState("EUR");
  const [toCurrency, setToCurrency] = useState("USD");
  const [rate, setRate] = useState("");
  const [rateSource, setRateSource] = useState("manual");
  const [observedAt, setObservedAt] = useState(localDateTimeValue());

  async function load() {
    const [nextAccounts, nextCategories, nextRates, profileResult] = await Promise.all([
      getFinanceAccounts(),
      getFinanceCategories(),
      getFinanceFxRates(),
      getCurrentProfile(),
    ]);
    setAccounts(nextAccounts);
    setCategories(nextCategories);
    setRates(nextRates);
    setCanManage(hasPermission(profileResult.profile?.roles, "finance.manage"));
  }

  useEffect(() => {
    void load().catch((error) => setMessage({ variant: "error", text: error instanceof Error ? error.message : "Finance accounts could not be loaded." }));
  }, []);

  const activeCurrencies = useMemo(() => Array.from(new Set(accounts.filter((account) => account.is_active).map((account) => account.currency_code))), [accounts]);

  async function submitAccount(event: FormEvent) {
    event.preventDefault();
    if (!canManage || busy) return;
    setBusy(true);
    try {
      await createFinanceAccount({
        code: accountCode,
        name: accountName,
        accountType,
        currencyCode: accountCurrency,
        institutionName,
        referenceNo: accountReference,
      });
      setAccountCode("");
      setAccountName("");
      setInstitutionName("");
      setAccountReference("");
      setMessage({ variant: "success", text: "Finance account created." });
      await load();
    } catch (error) {
      setMessage({ variant: "error", text: error instanceof Error ? error.message : "Finance account could not be created." });
    } finally {
      setBusy(false);
    }
  }

  async function toggleAccount(account: FinanceAccount) {
    if (!canManage || busy) return;
    setBusy(true);
    try {
      await updateFinanceAccount({
        accountId: account.id,
        name: account.name,
        institutionName: account.institution_name,
        referenceNo: account.reference_no,
        isActive: !account.is_active,
      });
      setMessage({ variant: "success", text: `Finance account ${account.is_active ? "deactivated" : "activated"}.` });
      await load();
    } catch (error) {
      setMessage({ variant: "error", text: error instanceof Error ? error.message : "Finance account could not be updated." });
    } finally {
      setBusy(false);
    }
  }

  async function submitCategory(event: FormEvent) {
    event.preventDefault();
    if (!canManage || busy) return;
    setBusy(true);
    try {
      await createFinanceCategory({ code: categoryCode, name: categoryName, categoryType });
      setCategoryCode("");
      setCategoryName("");
      setMessage({ variant: "success", text: "Finance category created." });
      await load();
    } catch (error) {
      setMessage({ variant: "error", text: error instanceof Error ? error.message : "Finance category could not be created." });
    } finally {
      setBusy(false);
    }
  }

  async function submitRate(event: FormEvent) {
    event.preventDefault();
    if (!canManage || busy) return;
    setBusy(true);
    try {
      const numericRate = Number(rate);
      if (!Number.isFinite(numericRate) || numericRate <= 0) throw new Error("FX rate must be greater than zero.");
      await upsertFinanceFxRate({
        fromCurrency,
        toCurrency,
        rate: numericRate,
        rateSource,
        observedAt: new Date(observedAt).toISOString(),
      });
      setRate("");
      setMessage({ variant: "success", text: "FX observation saved." });
      await load();
    } catch (error) {
      setMessage({ variant: "error", text: error instanceof Error ? error.message : "FX observation could not be saved." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {message ? <Alert variant={message.variant} title={message.variant === "success" ? "Saved" : "Finance error"} message={message.text} /> : null}

      {canManage ? (
        <div className="grid gap-6 xl:grid-cols-3">
          <ComponentCard title="New Finance Account" desc="Bank, cash and clearing balances are derived from posted Finance transactions.">
            <form onSubmit={submitAccount} className="space-y-4">
              <div><Label htmlFor="finance-account-code">Code</Label><Input id="finance-account-code" value={accountCode} onChange={(event) => setAccountCode(event.target.value)} required /></div>
              <div><Label htmlFor="finance-account-name">Name</Label><Input id="finance-account-name" value={accountName} onChange={(event) => setAccountName(event.target.value)} required /></div>
              <div><Label htmlFor="finance-account-type">Type</Label><Select id="finance-account-type" options={accountTypeOptions} value={accountType} onChange={(value) => setAccountType(value as FinanceAccountType)} /></div>
              <div><Label htmlFor="finance-account-currency">Currency</Label><Input id="finance-account-currency" value={accountCurrency} maxLength={3} onChange={(event) => setAccountCurrency(event.target.value.toUpperCase())} required /></div>
              <div><Label htmlFor="finance-account-institution">Institution</Label><Input id="finance-account-institution" value={institutionName} onChange={(event) => setInstitutionName(event.target.value)} /></div>
              <div><Label htmlFor="finance-account-reference">Reference</Label><Input id="finance-account-reference" value={accountReference} onChange={(event) => setAccountReference(event.target.value)} /></div>
              <Button type="submit" disabled={busy}>Create Account</Button>
            </form>
          </ComponentCard>

          <ComponentCard title="New Category" desc="Operational Finance categories remain separate from a statutory chart of accounts.">
            <form onSubmit={submitCategory} className="space-y-4">
              <div><Label htmlFor="finance-category-code">Code</Label><Input id="finance-category-code" value={categoryCode} onChange={(event) => setCategoryCode(event.target.value)} required /></div>
              <div><Label htmlFor="finance-category-name">Name</Label><Input id="finance-category-name" value={categoryName} onChange={(event) => setCategoryName(event.target.value)} required /></div>
              <div><Label htmlFor="finance-category-type">Type</Label><Select id="finance-category-type" options={categoryTypeOptions} value={categoryType} onChange={(value) => setCategoryType(value as FinanceCategoryType)} /></div>
              <Button type="submit" disabled={busy}>Create Category</Button>
            </form>
          </ComponentCard>

          <ComponentCard title="FX Observation" desc="Saved observations may be used only when observed at or before the Finance transaction time.">
            <form onSubmit={submitRate} className="space-y-4">
              <div><Label htmlFor="finance-fx-from">From currency</Label><Input id="finance-fx-from" value={fromCurrency} maxLength={3} onChange={(event) => setFromCurrency(event.target.value.toUpperCase())} required /></div>
              <div><Label htmlFor="finance-fx-to">To currency</Label><Input id="finance-fx-to" value={toCurrency} maxLength={3} onChange={(event) => setToCurrency(event.target.value.toUpperCase())} required /></div>
              <div><Label htmlFor="finance-fx-rate">Rate</Label><Input id="finance-fx-rate" type="number" min="0.0000000001" step="0.0000000001" value={rate} onChange={(event) => setRate(event.target.value)} required /></div>
              <div><Label htmlFor="finance-fx-source">Source</Label><Input id="finance-fx-source" value={rateSource} onChange={(event) => setRateSource(event.target.value)} required /></div>
              <div><Label htmlFor="finance-fx-observed">Observed at</Label><Input id="finance-fx-observed" type="datetime-local" value={observedAt} onChange={(event) => setObservedAt(event.target.value)} required /></div>
              <Button type="submit" disabled={busy}>Save FX Rate</Button>
            </form>
          </ComponentCard>
        </div>
      ) : (
        <Alert variant="info" title="Read-only Finance access" message="Your role can view Finance Core data but cannot create or change Finance accounts, categories or FX observations." />
      )}

      <ComponentCard title="Cash & Bank Accounts" desc={`Active account currencies: ${activeCurrencies.join(", ") || "none"}`}>
        <TableViewport>
          <Table variant="admin" minWidth="standard">
            <TableHeader variant="admin"><TableRow><TableCell isHeader variant="admin">Account</TableCell><TableCell isHeader variant="admin">Type</TableCell><TableCell isHeader variant="admin">Currency</TableCell><TableCell isHeader variant="admin" className="text-right">Balance</TableCell><TableCell isHeader variant="admin">Status</TableCell><TableCell isHeader variant="admin">Action</TableCell></TableRow></TableHeader>
            <TableBody variant="admin">
              {accounts.length === 0 ? <TableStateRow colSpan={6}>No Finance accounts.</TableStateRow> : accounts.map((account) => (
                <TableRow key={account.id}>
                  <TableCell variant="admin"><span className="font-medium">{account.name}</span><div className="text-xs">{account.code}{account.institution_name ? ` · ${account.institution_name}` : ""}</div></TableCell>
                  <TableCell variant="admin">{account.account_type}</TableCell>
                  <TableCell variant="admin">{account.currency_code}</TableCell>
                  <TableCell variant="admin" className="text-right font-medium">{money(account.balance, account.currency_code)}</TableCell>
                  <TableCell variant="admin"><Badge color={account.is_active ? "success" : "light"}>{account.is_active ? "Active" : "Inactive"}</Badge></TableCell>
                  <TableCell variant="admin">{canManage ? <Button size="sm" variant="outline" disabled={busy} onClick={() => void toggleAccount(account)}>{account.is_active ? "Deactivate" : "Activate"}</Button> : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableViewport>
      </ComponentCard>

      <div className="grid gap-6 xl:grid-cols-2">
        <ComponentCard title="Categories">
          <TableViewport><Table variant="admin"><TableHeader variant="admin"><TableRow><TableCell isHeader variant="admin">Code</TableCell><TableCell isHeader variant="admin">Name</TableCell><TableCell isHeader variant="admin">Type</TableCell></TableRow></TableHeader><TableBody variant="admin">{categories.length === 0 ? <TableStateRow colSpan={3}>No Finance categories.</TableStateRow> : categories.map((category) => <TableRow key={category.id}><TableCell variant="admin">{category.code}</TableCell><TableCell variant="admin">{category.name}</TableCell><TableCell variant="admin">{category.category_type}</TableCell></TableRow>)}</TableBody></Table></TableViewport>
        </ComponentCard>

        <ComponentCard title="Recent FX Observations">
          <TableViewport><Table variant="admin"><TableHeader variant="admin"><TableRow><TableCell isHeader variant="admin">Pair</TableCell><TableCell isHeader variant="admin">Rate</TableCell><TableCell isHeader variant="admin">Source</TableCell><TableCell isHeader variant="admin">Observed</TableCell></TableRow></TableHeader><TableBody variant="admin">{rates.length === 0 ? <TableStateRow colSpan={4}>No FX observations.</TableStateRow> : rates.slice(0, 20).map((item) => <TableRow key={item.id}><TableCell variant="admin">{item.from_currency}/{item.to_currency}</TableCell><TableCell variant="admin">{Number(item.rate).toFixed(6)}</TableCell><TableCell variant="admin">{item.rate_source}</TableCell><TableCell variant="admin">{new Date(item.observed_at).toLocaleString()}</TableCell></TableRow>)}</TableBody></Table></TableViewport>
        </ComponentCard>
      </div>
    </div>
  );
}
