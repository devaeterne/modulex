"use client";

import { useCallback, useEffect, useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { ADMIN_TEXT_STYLES } from "@/components/ui/theme/adminTheme";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
  TableStateRow,
  TableViewport,
} from "@/components/ui/table";
import {
  loadProjectFinancialSummary,
  type ProjectFinancialSummary as ProjectFinancialSummaryData,
} from "@/lib/customers/project-financial";

function money(value: number | null, currency: string) {
  if (value === null) return "Unavailable";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

function percent(value: number | null) {
  return value === null ? "Unavailable" : `${value.toFixed(2)}%`;
}

export default function ProjectFinancialSummary({ projectId }: { projectId: string }) {
  const [summary, setSummary] = useState<ProjectFinancialSummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSummary(await loadProjectFinancialSummary(projectId));
    } catch (loadError) {
      setSummary(null);
      setError(loadError instanceof Error ? loadError.message : "Project financial summary could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !summary) {
    return (
      <ComponentCard title="Project Financial Summary" desc="Calculating canonical sales, current-cost, invoice, and collection rollups.">
        <p className={`text-sm ${ADMIN_TEXT_STYLES.body}`} role="status">Loading Project financials…</p>
      </ComponentCard>
    );
  }

  if (!summary) {
    return (
      <ComponentCard title="Project Financial Summary" desc="Internal Project cost and margin visibility is restricted to authorized roles.">
        <div className="space-y-3">
          <div role="alert">
            <Alert variant="error" title="Financial summary unavailable" message={error || "Project financial summary could not be loaded."} />
          </div>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>Retry</Button>
        </div>
      </ComponentCard>
    );
  }

  const { mixedCurrency, missingCostLines } = summary;

  return (
    <ComponentCard
      title="Project Financial Summary"
      desc="Sales use active Project Orders; cost uses current canonical Product Costs; invoice totals exclude draft and void invoices."
      headerAction={<Badge color={summary.costComplete ? "success" : "warning"}>{summary.costComplete ? "Cost complete" : "Review required"}</Badge>}
    >
      <div className="space-y-4">
        {mixedCurrency ? (
          <div role="alert">
            <Alert
              variant="warning"
              title="Mixed currencies — profitability blocked"
              message="This Project contains more than one currency across Orders, current costs, or issued invoices. FX conversion is not configured, so financial totals are not combined."
            />
          </div>
        ) : null}
        {!mixedCurrency && missingCostLines > 0 ? (
          <div role="alert">
            <Alert
              variant="warning"
              title="Incomplete cost coverage"
              message={`${missingCostLines} active Order line${missingCostLines === 1 ? " is" : "s are"} missing a compatible current Product Cost. Total Cost, Gross Profit, Gross Margin, and Markup remain unavailable until cost coverage is complete.`}
            />
          </div>
        ) : null}

        <div className={`grid gap-4 text-sm md:grid-cols-2 xl:grid-cols-4 ${ADMIN_TEXT_STYLES.body}`}>
          <p><strong className={ADMIN_TEXT_STYLES.strong}>Total Sales:</strong> {money(summary.totalSales, summary.currencyCode)}</p>
          <p><strong className={ADMIN_TEXT_STYLES.strong}>Total Cost:</strong> {money(summary.totalCost, summary.currencyCode)}</p>
          <p><strong className={ADMIN_TEXT_STYLES.strong}>Gross Profit:</strong> {money(summary.grossProfit, summary.currencyCode)}</p>
          <p><strong className={ADMIN_TEXT_STYLES.strong}>Gross Margin:</strong> {percent(summary.grossMarginPercent)}</p>
          <p><strong className={ADMIN_TEXT_STYLES.strong}>Markup:</strong> {percent(summary.markupPercent)}</p>
          <p><strong className={ADMIN_TEXT_STYLES.strong}>Invoiced:</strong> {money(summary.invoiced, summary.currencyCode)}</p>
          <p><strong className={ADMIN_TEXT_STYLES.strong}>Paid:</strong> {money(summary.paid, summary.currencyCode)}</p>
          <p><strong className={ADMIN_TEXT_STYLES.strong}>Balance:</strong> {money(summary.balance, summary.currencyCode)}</p>
        </div>

        <TableViewport>
          <Table variant="admin" minWidth="standard">
            <TableHeader variant="admin">
              <TableRow>
                <TableCell isHeader variant="admin">Category</TableCell>
                <TableCell isHeader variant="admin">Sales</TableCell>
                <TableCell isHeader variant="admin">Cost</TableCell>
                <TableCell isHeader variant="admin">Gross Profit</TableCell>
                <TableCell isHeader variant="admin">Margin</TableCell>
                <TableCell isHeader variant="admin">Markup</TableCell>
                <TableCell isHeader variant="admin">Cost Coverage</TableCell>
              </TableRow>
            </TableHeader>
            <TableBody variant="admin">
              {loading ? <TableStateRow colSpan={7}>Refreshing Project financials…</TableStateRow> : null}
              {!loading && summary.categories.length === 0 ? <TableStateRow colSpan={7}>No financial categories are available.</TableStateRow> : null}
              {!loading ? summary.categories.map((category) => (
                <TableRow key={category.category}>
                  <TableCell variant="admin"><span className="font-medium">{category.category}</span></TableCell>
                  <TableCell variant="admin">{money(category.totalSales, summary.currencyCode)}</TableCell>
                  <TableCell variant="admin">{money(category.totalCost, summary.currencyCode)}</TableCell>
                  <TableCell variant="admin">{money(category.grossProfit, summary.currencyCode)}</TableCell>
                  <TableCell variant="admin">{percent(category.grossMarginPercent)}</TableCell>
                  <TableCell variant="admin">{percent(category.markupPercent)}</TableCell>
                  <TableCell variant="admin">
                    <Badge color={category.missingCostLines === 0 && !summary.mixedCurrency ? "success" : "warning"}>
                      {category.missingCostLines === 0 && !summary.mixedCurrency ? "Complete" : `${category.missingCostLines} missing`}
                    </Badge>
                  </TableCell>
                </TableRow>
              )) : null}
            </TableBody>
          </Table>
        </TableViewport>

        <p className={`text-sm ${ADMIN_TEXT_STYLES.muted}`}>
          Gross Margin = Gross Profit ÷ Total Sales. Markup = Gross Profit ÷ Total Cost. Current-cost profitability is intentionally unavailable when cost coverage or currency consistency is incomplete.
        </p>
      </div>
    </ComponentCard>
  );
}
