"use client";

import { useEffect, useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import Label from "@/components/form/Label";
import Checkbox from "@/components/form/input/Checkbox";
import Input from "@/components/form/input/InputField";
import Alert from "@/components/ui/alert/Alert";
import Button from "@/components/ui/button/Button";
import { Table, TableBody, TableCell, TableHeader, TableRow, TableViewport } from "@/components/ui/table";
import { hasPermission } from "@/lib/auth/permissions";
import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { parseDbDecimal } from "@/lib/validation";

type TaxRule = {
  fulfillment_type: "pickup" | "delivery" | "delivery_installation";
  label: string;
  tax_rate: string | number | null;
  is_active: boolean;
  notes: string | null;
};

type TaxRuleErrors = Record<string, string | undefined>;
const TAX_RATE_DECIMAL = { precision: 7, scale: 3, min: 0, max: 100 } as const;

export default function TaxRulesSettings() {
  const [rules, setRules] = useState<TaxRule[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<TaxRuleErrors>({});

  async function load() {
    setIsLoading(true);
    const { profile, error: profileError } = await getCurrentProfile();
    if (profileError || !profile) {
      setErrorMessage(profileError?.message || "Active staff profile is required.");
      setIsLoading(false);
      return;
    }
    setCanEdit(hasPermission(profile.roles, "finance.manage"));
    const { data, error } = await supabase
      .from("order_tax_rules")
      .select("fulfillment_type, label, tax_rate, is_active, notes")
      .order("fulfillment_type");
    if (error) setErrorMessage(error.message);
    else setRules((data ?? []) as TaxRule[]);
    setIsLoading(false);
  }

  useEffect(() => { void load(); }, []);

  function updateRule(type: TaxRule["fulfillment_type"], values: Partial<TaxRule>) {
    setRules((current) => current.map((rule) => rule.fulfillment_type === type ? { ...rule, ...values } : rule));
    setSuccessMessage(null);
  }

  function validateRate(rule: TaxRule) {
    const raw = rule.tax_rate === null ? "" : String(rule.tax_rate).trim();
    if (!raw) {
      return rule.is_active
        ? { value: null, error: "Enter a tax rate between 0 and 100 before enabling the rule." }
        : { value: null, error: null };
    }
    return parseDbDecimal(raw, TAX_RATE_DECIMAL);
  }

  async function save() {
    if (!canEdit || isSaving) return;
    setErrorMessage(null);
    setSuccessMessage(null);

    const nextErrors: TaxRuleErrors = {};
    const parsedRates = new Map<TaxRule["fulfillment_type"], string | null>();
    for (const rule of rules) {
      const parsedRate = validateRate(rule);
      if (parsedRate.error) nextErrors[rule.fulfillment_type] = parsedRate.error;
      else parsedRates.set(rule.fulfillment_type, parsedRate.value);
    }
    setFieldErrors(nextErrors);
    const firstInvalid = rules.find((rule) => nextErrors[rule.fulfillment_type]);
    if (firstInvalid) {
      requestAnimationFrame(() => document.getElementById(`tax-rate-${firstInvalid.fulfillment_type}`)?.focus());
      return;
    }

    setIsSaving(true);
    for (const rule of rules) {
      const rateValue = parsedRates.get(rule.fulfillment_type) ?? null;
      const { error } = await supabase
        .from("order_tax_rules")
        .update({
          tax_rate: rateValue,
          is_active: rule.is_active,
          notes: rule.notes?.trim() || null,
        })
        .eq("fulfillment_type", rule.fulfillment_type);
      if (error) {
        setErrorMessage(error.message);
        setIsSaving(false);
        return;
      }
    }

    setSuccessMessage("Tax rules saved.");
    setIsSaving(false);
    await load();
  }

  if (isLoading) return <Alert variant="info" title="Loading tax rules" message="Fulfillment tax configuration is being loaded." />;

  return (
    <div className="space-y-5">
      {errorMessage ? <Alert variant="error" title="Tax rule update failed" message={errorMessage} /> : null}
      {successMessage ? <Alert variant="success" title="Tax rules updated" message={successMessage} /> : null}
      <ComponentCard
        title="Fulfillment Tax Rules"
        desc="Configure the rate the application expects for each fulfillment mode. Rates use the production numeric(7,3) contract; active rules require a value from 0 to 100."
      >
        <TableViewport>
          <Table variant="admin" minWidth="medium">
            <TableHeader variant="admin">
              <TableRow>{["Fulfillment", "Tax Rate (%)", "Active", "Notes"].map((label) => <TableCell key={label} isHeader variant="admin">{label}</TableCell>)}</TableRow>
            </TableHeader>
            <TableBody variant="admin">
              {rules.map((rule) => {
                const error = fieldErrors[rule.fulfillment_type];
                return (
                  <TableRow key={rule.fulfillment_type}>
                    <TableCell variant="admin"><div className="space-y-1"><strong>{rule.label}</strong><div>{rule.fulfillment_type.replaceAll("_", " ")}</div></div></TableCell>
                    <TableCell variant="admin">
                      <Label htmlFor={`tax-rate-${rule.fulfillment_type}`}>Tax rate</Label>
                      <Input id={`tax-rate-${rule.fulfillment_type}`} value={rule.tax_rate ?? ""} inputMode="decimal" disabled={!canEdit} onChange={(event) => { updateRule(rule.fulfillment_type, { tax_rate: event.target.value }); setFieldErrors((current) => ({ ...current, [rule.fulfillment_type]: undefined })); }} error={Boolean(error)} hint={error} placeholder="e.g. 6.000" />
                    </TableCell>
                    <TableCell variant="admin"><Checkbox id={`tax-active-${rule.fulfillment_type}`} checked={rule.is_active} disabled={!canEdit} label="Use rule" onChange={(checked) => updateRule(rule.fulfillment_type, { is_active: checked })} /></TableCell>
                    <TableCell variant="admin"><Input id={`tax-notes-${rule.fulfillment_type}`} value={rule.notes ?? ""} disabled={!canEdit} onChange={(event) => updateRule(rule.fulfillment_type, { notes: event.target.value })} placeholder="Optional internal note" /></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableViewport>
        <div className="mt-5 space-y-3">
          <Alert variant="warning" title="Tax configuration" message="Use rates confirmed for the company’s actual tax jurisdiction and transaction type. The application enforces the configured business rule; it does not determine tax law automatically." />
          {canEdit ? <div className="flex justify-end"><Button disabled={isSaving} onClick={() => void save()}>{isSaving ? "Saving..." : "Save Tax Rules"}</Button></div> : null}
        </div>
      </ComponentCard>
    </div>
  );
}
