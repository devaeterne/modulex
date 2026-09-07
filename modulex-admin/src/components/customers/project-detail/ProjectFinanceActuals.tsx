"use client";

import { useEffect, useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import Alert from "@/components/ui/alert/Alert";
import {
  getProjectFinanceActuals,
  type ProjectFinanceActuals as ProjectFinanceActualsData,
} from "@/lib/finance/reports";

function money(value: number | null, currency: string) {
  if (value === null) return "Unavailable";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

function signedMoney(value: number | null, currency: string) {
  if (value === null) return "Unavailable";
  if (value > 0) return `+${money(value, currency)}`;
  if (value < 0) return `-${money(Math.abs(value), currency)}`;
  return money(0, currency);
}

export default function ProjectFinanceActuals({ projectId }: { projectId: string }) {
  const [actuals, setActuals] = useState<ProjectFinanceActualsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getProjectFinanceActuals({ projectId })
      .then((data) => {
        if (!active) return;
        setActuals(data);
        setError(null);
      })
      .catch((value) => {
        if (!active) return;
        setError(value instanceof Error ? value.message : "Project Finance actuals could not be loaded.");
      });
    return () => { active = false; };
  }, [projectId]);

  if (error) {
    return <Alert variant="error" title="Finance actuals unavailable" message={error} />;
  }

  return (
    <ComponentCard
      title="Finance Actuals"
      desc="Posted Finance Core transactions explicitly allocated to this Project. This is separate from the commercial/current-cost profitability view below."
    >
      {!actuals ? <p className="text-sm text-gray-500 dark:text-gray-400" role="status">Loading Finance actuals…</p> : null}
      {actuals ? (
        <div className="space-y-5">
          {actuals.unconverted_allocation_count > 0 ? (
            <Alert
              variant="warning"
              title="Base total unavailable"
              message={`${actuals.unconverted_allocation_count} linked allocation(s) do not have a usable stored Finance base snapshot. No current FX rate was substituted.`}
            />
          ) : null}

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Metric label="Operating Income" value={money(actuals.linked_operating_income_base, actuals.base_currency_code)} />
            <Metric label="Operating Expense" value={money(actuals.linked_operating_expense_base, actuals.base_currency_code)} />
            <Metric label="Other Cash" value={signedMoney(actuals.linked_other_cash_base, actuals.base_currency_code)} />
            <Metric label="Net Linked Cash" value={signedMoney(actuals.linked_net_cash_base, actuals.base_currency_code)} />
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-gray-500 dark:text-gray-400">
            <span>{actuals.linked_transaction_count} linked Finance transaction(s)</span>
            <span>{actuals.linked_order_count} explicitly linked Order(s)</span>
            <span>Reporting currency: {actuals.base_currency_code}</span>
          </div>

          {actuals.linked_transaction_count === 0 ? (
            <p className="rounded-lg border border-dashed border-gray-300 p-4 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
              No posted Finance transaction is explicitly allocated to this Project yet. Project actuals remain zero; no attribution is inferred from Customer, Invoice, Vendor or other source links.
            </p>
          ) : null}

          {actuals.orders.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-gray-800 dark:text-white/90">Order allocation inputs</p>
              <div className="grid gap-3 md:grid-cols-2">
                {actuals.orders.map((order) => (
                  <div key={order.order_id} className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium text-gray-800 dark:text-white/90">{order.order_number || "Order"}</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">{order.transaction_count} transaction(s)</span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-gray-500 dark:text-gray-400">
                      <span>Income: {money(order.operating_income_base, actuals.base_currency_code)}</span>
                      <span>Expense: {money(order.operating_expense_base, actuals.base_currency_code)}</span>
                      <span>Other: {signedMoney(order.other_cash_base, actuals.base_currency_code)}</span>
                      <span>Net: {signedMoney(order.net_cash_base, actuals.base_currency_code)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </ComponentCard>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-2 text-lg font-semibold text-gray-900 dark:text-white">{value}</p>
    </div>
  );
}
