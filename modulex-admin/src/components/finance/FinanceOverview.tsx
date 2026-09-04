"use client";

import { useEffect, useState } from "react";
import Alert from "@/components/ui/alert/Alert";
import ComponentCard from "@/components/common/ComponentCard";
import { getFinanceOverview, type FinanceOverview as FinanceOverviewData } from "@/lib/finance/core";

const money = (value: number, currency: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(value || 0));

export default function FinanceOverview() {
  const [overview, setOverview] = useState<FinanceOverviewData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getFinanceOverview()
      .then((data) => {
        if (!active) return;
        setOverview(data);
        setError(null);
      })
      .catch((value) => {
        if (!active) return;
        setError(value instanceof Error ? value.message : "Finance overview could not be loaded.");
      });
    return () => { active = false; };
  }, []);

  if (error) {
    return <Alert variant="error" title="Finance unavailable" message={error} />;
  }

  if (!overview) {
    return <ComponentCard title="Finance Overview" desc="Loading Finance Core balances and transaction state."><p className="text-sm">Loading...</p></ComponentCard>;
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-3">
        <ComponentCard title="Active Accounts" desc="Bank, cash and clearing accounts">
          <p className="text-2xl font-semibold">{overview.active_account_count}</p>
        </ComponentCard>
        <ComponentCard title="Draft Transactions" desc="Editable and not yet included in balances">
          <p className="text-2xl font-semibold">{overview.draft_transaction_count}</p>
        </ComponentCard>
        <ComponentCard title="Posted Transactions" desc={`Reporting currency: ${overview.base_currency}`}>
          <p className="text-2xl font-semibold">{overview.posted_transaction_count}</p>
        </ComponentCard>
      </div>

      <ComponentCard title="Cash & Bank Balances" desc="Balances are derived from posted Finance transactions; no balance snapshot is maintained.">
        {overview.account_balances.length === 0 ? (
          <p className="text-sm">No active Finance accounts yet.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {overview.account_balances.map((account) => (
              <div key={account.id} className="space-y-1">
                <p className="text-sm font-medium">{account.name}</p>
                <p className="text-xl font-semibold">{money(account.balance, account.currency_code)}</p>
                <p className="text-xs">{account.type} · {account.currency_code}</p>
              </div>
            ))}
          </div>
        )}
      </ComponentCard>
    </div>
  );
}
