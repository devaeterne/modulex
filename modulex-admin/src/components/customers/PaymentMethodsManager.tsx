"use client";

import { useEffect, useMemo, useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import Label from "@/components/form/Label";
import Checkbox from "@/components/form/input/Checkbox";
import Input from "@/components/form/input/InputField";
import Alert from "@/components/ui/alert/Alert";
import Button from "@/components/ui/button/Button";
import { Table, TableBody, TableCell, TableHeader, TableRow, TableViewport } from "@/components/ui/table";
import { hasPermission } from "@/lib/auth/permissions";
import type { PaymentMethod } from "@/lib/customers/types";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { supabase } from "@/lib/supabase/client";
import { parseDbDecimal } from "@/lib/validation";

const PERCENT_DECIMAL = { precision: 7, scale: 3, min: 0, max: 100, allowNull: false } as const;

function makeSystemKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || `payment_${Date.now()}`;
}

export default function PaymentMethodsManager() {
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newCommission, setNewCommission] = useState("0");
  const [newNameError, setNewNameError] = useState<string | null>(null);
  const [newCommissionError, setNewCommissionError] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, { name?: string; commission?: string }>>({});

  const sorted = useMemo(() => [...methods].sort((a, b) => a.sort_order - b.sort_order), [methods]);

  async function load() {
    setIsLoading(true);
    setErrorMessage(null);
    const { data, error } = await supabase
      .from("payment_methods")
      .select("id, system_key, name, commission_percent, sort_order, is_active, created_at, updated_at")
      .order("sort_order");
    if (error) setErrorMessage(error.message);
    else setMethods((data ?? []) as PaymentMethod[]);
    setIsLoading(false);
  }

  useEffect(() => {
    async function init() {
      const { profile, error } = await getCurrentProfile();
      if (error) {
        setErrorMessage(error.message);
        setIsLoading(false);
        return;
      }
      setCanEdit(hasPermission(profile?.roles, "finance.manage"));
      await load();
    }
    void init();
  }, []);

  function focus(id: string) {
    requestAnimationFrame(() => document.getElementById(id)?.focus());
  }

  async function addMethod() {
    const name = newName.trim();
    const parsedCommission = parseDbDecimal(newCommission, PERCENT_DECIMAL);
    const nameError = name ? null : "Payment method name is required.";
    const commissionError = parsedCommission.error;
    setNewNameError(nameError);
    setNewCommissionError(commissionError);
    if (nameError || commissionError || parsedCommission.value === null) {
      focus(nameError ? "new-payment-name" : "new-payment-commission");
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    const nextSort = sorted.length ? Math.max(...sorted.map((method) => method.sort_order)) + 10 : 10;
    const { error } = await supabase.from("payment_methods").insert({
      system_key: makeSystemKey(name),
      name,
      commission_percent: parsedCommission.value,
      sort_order: nextSort,
      is_active: true,
    });
    if (error) setErrorMessage(error.message);
    else {
      setNewName("");
      setNewCommission("0");
      setNewNameError(null);
      setNewCommissionError(null);
      await load();
      setSuccessMessage("Payment method added.");
    }
    setIsSaving(false);
  }

  async function saveMethod(method: PaymentMethod) {
    const name = method.name.trim();
    const parsedCommission = parseDbDecimal(method.commission_percent, PERCENT_DECIMAL);
    const errors = {
      name: name ? undefined : "Payment method name cannot be empty.",
      commission: parsedCommission.error ?? undefined,
    };
    setRowErrors((current) => ({ ...current, [method.id]: errors }));
    if (errors.name || errors.commission || parsedCommission.value === null) {
      focus(errors.name ? `payment-name-${method.id}` : `payment-commission-${method.id}`);
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    const { error } = await supabase
      .from("payment_methods")
      .update({
        name,
        commission_percent: parsedCommission.value,
        is_active: method.is_active,
        sort_order: method.sort_order,
      })
      .eq("id", method.id);
    if (error) setErrorMessage(error.message);
    else {
      setRowErrors((current) => ({ ...current, [method.id]: {} }));
      await load();
      setSuccessMessage("Payment method saved.");
    }
    setIsSaving(false);
  }

  async function move(method: PaymentMethod, direction: -1 | 1) {
    const index = sorted.findIndex((item) => item.id === method.id);
    const swapIndex = index + direction;
    if (index < 0 || swapIndex < 0 || swapIndex >= sorted.length) return;
    const other = sorted[swapIndex];
    setIsSaving(true);
    setErrorMessage(null);
    const first = await supabase.from("payment_methods").update({ sort_order: other.sort_order }).eq("id", method.id);
    if (first.error) {
      setErrorMessage(first.error.message);
      setIsSaving(false);
      return;
    }
    const second = await supabase.from("payment_methods").update({ sort_order: method.sort_order }).eq("id", other.id);
    if (second.error) setErrorMessage(second.error.message);
    else await load();
    setIsSaving(false);
  }

  if (isLoading) return <Alert variant="info" title="Loading payment methods" message="Payment method configuration is being loaded." />;

  return (
    <div className="space-y-5">
      <ComponentCard title="Payment Methods" desc="Manage payment methods available on customer orders and their commission percentages." />
      {errorMessage ? <Alert variant="error" title="Payment method update failed" message={errorMessage} /> : null}
      {successMessage ? <Alert variant="success" title="Payment methods updated" message={successMessage} /> : null}

      {canEdit ? (
        <ComponentCard title="Add Payment Method" desc="Commission is stored with the database numeric(7,3) contract.">
          <div className="grid gap-3 md:grid-cols-[1fr_180px_auto] md:items-end">
            <div>
              <Label htmlFor="new-payment-name">Payment method name</Label>
              <Input id="new-payment-name" value={newName} onChange={(event) => { setNewName(event.target.value); setNewNameError(null); }} error={Boolean(newNameError)} hint={newNameError ?? undefined} />
            </div>
            <div>
              <Label htmlFor="new-payment-commission">Commission (%)</Label>
              <Input id="new-payment-commission" value={newCommission} inputMode="decimal" onChange={(event) => { setNewCommission(event.target.value); setNewCommissionError(null); }} error={Boolean(newCommissionError)} hint={newCommissionError ?? undefined} />
            </div>
            <Button disabled={isSaving} onClick={() => void addMethod()}>Add Method</Button>
          </div>
        </ComponentCard>
      ) : null}

      <ComponentCard title="Configured Methods" desc="Order controls affect presentation order only; method keys remain stable.">
        <TableViewport>
          <Table variant="admin" minWidth="medium">
            <TableHeader variant="admin">
              <TableRow>{["Order", "Payment Method", "System Key", "Commission", "Status", "Actions"].map((label) => <TableCell key={label} isHeader variant="admin">{label}</TableCell>)}</TableRow>
            </TableHeader>
            <TableBody variant="admin">
              {sorted.map((method, index) => {
                const errors = rowErrors[method.id] ?? {};
                return (
                  <TableRow key={method.id}>
                    <TableCell variant="admin"><div className="flex gap-1"><Button size="sm" variant="outline" disabled={!canEdit || isSaving || index === 0} onClick={() => void move(method, -1)}>↑</Button><Button size="sm" variant="outline" disabled={!canEdit || isSaving || index === sorted.length - 1} onClick={() => void move(method, 1)}>↓</Button></div></TableCell>
                    <TableCell variant="admin"><Input id={`payment-name-${method.id}`} disabled={!canEdit} value={method.name} onChange={(event) => { setMethods((current) => current.map((item) => item.id === method.id ? { ...item, name: event.target.value } : item)); setRowErrors((current) => ({ ...current, [method.id]: { ...current[method.id], name: undefined } })); }} error={Boolean(errors.name)} hint={errors.name} /></TableCell>
                    <TableCell variant="admin">{method.system_key}</TableCell>
                    <TableCell variant="admin"><Input id={`payment-commission-${method.id}`} disabled={!canEdit} value={String(method.commission_percent)} inputMode="decimal" onChange={(event) => { setMethods((current) => current.map((item) => item.id === method.id ? { ...item, commission_percent: event.target.value } : item)); setRowErrors((current) => ({ ...current, [method.id]: { ...current[method.id], commission: undefined } })); }} error={Boolean(errors.commission)} hint={errors.commission} /></TableCell>
                    <TableCell variant="admin"><Checkbox id={`payment-active-${method.id}`} disabled={!canEdit} checked={method.is_active} label={method.is_active ? "Active" : "Inactive"} onChange={(checked) => setMethods((current) => current.map((item) => item.id === method.id ? { ...item, is_active: checked } : item))} /></TableCell>
                    <TableCell variant="admin">{canEdit ? <Button size="sm" disabled={isSaving} onClick={() => void saveMethod(method)}>Save</Button> : null}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableViewport>
      </ComponentCard>
    </div>
  );
}
