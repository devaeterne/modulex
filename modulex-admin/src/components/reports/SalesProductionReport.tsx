"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import DateInput from "@/components/form/DateInput";
import Label from "@/components/form/Label";
import Select from "@/components/form/Select";
import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
  TableStateRow,
  TableViewport,
} from "@/components/ui/table";
import { ADMIN_TEXT_STYLES } from "@/components/ui/theme/adminTheme";
import { formatDateOnly } from "@/lib/dates/usDate";
import {
  getSalesProductionReport,
  type SalesProductionPaymentStatus,
  type SalesProductionReport as SalesProductionReportData,
  type SalesProductionReportFilters,
} from "@/lib/reports/salesProduction";

const PAGE_SIZE = 50;

function dateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function defaultFilters(): SalesProductionReportFilters {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  return {
    from: dateValue(firstDay),
    to: dateValue(today),
    salesRepId: null,
    material: null,
    location: null,
    paymentStatus: null,
    limit: PAGE_SIZE,
    offset: 0,
  };
}

function money(value: number | null, currency: string) {
  if (value === null) return "Unavailable";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${Number(value).toFixed(2)}`;
  }
}

function number(value: number, maximumFractionDigits = 2) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits }).format(value);
}

function paymentLabel(status: SalesProductionPaymentStatus) {
  switch (status) {
    case "not_invoiced":
      return "Not Invoiced";
    case "partially_paid":
      return "Partially Paid";
    case "overdue":
      return "Overdue";
    case "open":
      return "Open";
    case "paid":
      return "Paid";
  }
}

const PAYMENT_COLORS: Record<
  SalesProductionPaymentStatus,
  "light" | "warning" | "error" | "info" | "success"
> = {
  not_invoiced: "light",
  open: "info",
  partially_paid: "warning",
  overdue: "error",
  paid: "success",
};

function Metric({ title, value, helper }: { title: string; value: string; helper: string }) {
  return (
    <ComponentCard title={title}>
      <p className={`text-2xl font-semibold ${ADMIN_TEXT_STYLES.strong}`}>{value}</p>
      <p className={`text-xs ${ADMIN_TEXT_STYLES.muted}`}>{helper}</p>
    </ComponentCard>
  );
}

export default function SalesProductionReport() {
  const initialFilters = useMemo(defaultFilters, []);
  const [draftFrom, setDraftFrom] = useState(initialFilters.from ?? "");
  const [draftTo, setDraftTo] = useState(initialFilters.to ?? "");
  const [draftSalesRepId, setDraftSalesRepId] = useState("");
  const [draftMaterial, setDraftMaterial] = useState("");
  const [draftLocation, setDraftLocation] = useState("");
  const [draftPaymentStatus, setDraftPaymentStatus] = useState("");
  const [filters, setFilters] = useState<SalesProductionReportFilters>(initialFilters);
  const [report, setReport] = useState<SalesProductionReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const nextReport = await getSalesProductionReport(filters);
      setReport(nextReport);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Sales & Production report could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const summary = report?.summary;
  const currency = summary?.currency_code ?? "USD";
  const totalCount = report?.total_count ?? 0;
  const offset = filters.offset ?? 0;

  const salespersonOptions = useMemo(
    () => report?.filter_options.salespeople.map((item) => ({ value: item.id, label: item.name })) ?? [],
    [report],
  );
  const materialOptions = useMemo(
    () => report?.filter_options.materials.map((item) => ({ value: item, label: item })) ?? [],
    [report],
  );
  const locationOptions = useMemo(
    () => report?.filter_options.locations.map((item) => ({ value: item, label: item })) ?? [],
    [report],
  );
  const paymentOptions = useMemo(
    () => ["not_invoiced", "open", "partially_paid", "overdue", "paid"].map((status) => ({
      value: status,
      label: paymentLabel(status as SalesProductionPaymentStatus),
    })),
    [],
  );

  function applyFilters() {
    setFilters({
      from: draftFrom || null,
      to: draftTo || null,
      salesRepId: draftSalesRepId || null,
      material: draftMaterial || null,
      location: draftLocation || null,
      paymentStatus: (draftPaymentStatus || null) as SalesProductionPaymentStatus | null,
      limit: PAGE_SIZE,
      offset: 0,
    });
  }

  function clearFilters() {
    const next = defaultFilters();
    setDraftFrom(next.from ?? "");
    setDraftTo(next.to ?? "");
    setDraftSalesRepId("");
    setDraftMaterial("");
    setDraftLocation("");
    setDraftPaymentStatus("");
    setFilters(next);
  }

  function changePage(nextOffset: number) {
    setFilters((current) => ({ ...current, offset: Math.max(nextOffset, 0) }));
  }

  return (
    <div className="space-y-6">
      {error ? (
        <Alert
          variant="error"
          title="Sales & Production report unavailable"
          message={error}
          action={<Button size="sm" variant="outline" onClick={() => void loadReport()}>Retry</Button>}
        />
      ) : null}

      {summary?.mixed_currency ? (
        <Alert
          variant="warning"
          title="Mixed-currency monetary totals are unavailable"
          message="Modulex does not add unlike currencies or substitute a current FX rate. Job and production quantities remain available while affected monetary totals fail closed."
        />
      ) : null}

      <ComponentCard
        title="Report Filters"
        desc="Order date drives the reporting period. Salesperson uses Project assignment first and Customer assignment as fallback."
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div>
            <Label htmlFor="sales-production-from">From</Label>
            <DateInput id="sales-production-from" value={draftFrom} onChange={setDraftFrom} />
          </div>
          <div>
            <Label htmlFor="sales-production-to">To</Label>
            <DateInput id="sales-production-to" value={draftTo} onChange={setDraftTo} />
          </div>
          <div>
            <Label htmlFor="sales-production-salesperson">Salesperson</Label>
            <Select
              id="sales-production-salesperson"
              value={draftSalesRepId}
              options={salespersonOptions}
              allowEmpty
              placeholder="All salespeople"
              onChange={setDraftSalesRepId}
            />
          </div>
          <div>
            <Label htmlFor="sales-production-material">Material</Label>
            <Select
              id="sales-production-material"
              value={draftMaterial}
              options={materialOptions}
              allowEmpty
              placeholder="All materials"
              onChange={setDraftMaterial}
            />
          </div>
          <div>
            <Label htmlFor="sales-production-location">Location</Label>
            <Select
              id="sales-production-location"
              value={draftLocation}
              options={locationOptions}
              allowEmpty
              placeholder="All locations"
              onChange={setDraftLocation}
            />
          </div>
          <div>
            <Label htmlFor="sales-production-payment">Payment Status</Label>
            <Select
              id="sales-production-payment"
              value={draftPaymentStatus}
              options={paymentOptions}
              allowEmpty
              placeholder="All payment statuses"
              onChange={setDraftPaymentStatus}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button onClick={applyFilters} disabled={loading}>Apply Filters</Button>
          <Button variant="outline" onClick={clearFilters} disabled={loading}>Reset</Button>
        </div>
      </ComponentCard>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <Metric title="Sales" value={money(summary?.sales ?? null, currency)} helper="Canonical pre-tax customer-visible revenue" />
        <Metric title="Jobs" value={number(summary?.jobs ?? 0, 0)} helper="Non-cancelled Orders in the period" />
        <Metric title="Sq. Ft." value={number(summary?.sqft ?? 0)} helper="Countertop configuration area" />
        <Metric title="Avg Ticket" value={money(summary?.avg_ticket ?? null, currency)} helper="Sales divided by Jobs" />
        <Metric title="Open Balance" value={money(summary?.open_balance ?? null, currency)} helper="Issued Invoice receivable truth" />
        <Metric title="Jobs With Balance" value={number(summary?.jobs_with_balance ?? 0, 0)} helper={`${summary?.needs_attention ?? 0} job(s) need attention`} />
      </div>

      <ComponentCard title="Sales Trend" desc="Monthly order volume, canonical sales and countertop square footage.">
        <TableViewport>
          <Table variant="admin" minWidth="wide">
            <TableHeader variant="admin">
              <TableRow>
                <TableCell isHeader variant="admin">Month</TableCell>
                <TableCell isHeader variant="admin">Sales</TableCell>
                <TableCell isHeader variant="admin">Jobs</TableCell>
                <TableCell isHeader variant="admin">Sq. Ft.</TableCell>
              </TableRow>
            </TableHeader>
            <TableBody variant="admin">
              {loading ? <TableStateRow colSpan={4}>Loading sales trend…</TableStateRow> : null}
              {!loading && (report?.trend.length ?? 0) === 0 ? <TableStateRow colSpan={4}>No jobs match this reporting period.</TableStateRow> : null}
              {report?.trend.map((row) => (
                <TableRow key={row.period_start}>
                  <TableCell variant="admin">{formatDateOnly(row.period_start)}</TableCell>
                  <TableCell variant="admin">{money(row.sales, row.currency_code)}</TableCell>
                  <TableCell variant="admin">{number(row.jobs, 0)}</TableCell>
                  <TableCell variant="admin">{number(row.sqft)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableViewport>
      </ComponentCard>

      <div className="grid gap-6 xl:grid-cols-2">
        <ComponentCard title="Salesperson Performance" desc="Project salesperson assignment is preferred; Customer assignment is the fallback.">
          <TableViewport>
            <Table variant="admin" minWidth="wide">
              <TableHeader variant="admin">
                <TableRow>
                  <TableCell isHeader variant="admin">Salesperson</TableCell>
                  <TableCell isHeader variant="admin">Sales</TableCell>
                  <TableCell isHeader variant="admin">Jobs</TableCell>
                  <TableCell isHeader variant="admin">Sq. Ft.</TableCell>
                  <TableCell isHeader variant="admin">Open Balance</TableCell>
                </TableRow>
              </TableHeader>
              <TableBody variant="admin">
                {loading ? <TableStateRow colSpan={5}>Loading salesperson performance…</TableStateRow> : null}
                {!loading && (report?.salespeople.length ?? 0) === 0 ? <TableStateRow colSpan={5}>No salesperson activity in this period.</TableStateRow> : null}
                {report?.salespeople.map((row) => (
                  <TableRow key={row.sales_rep_id ?? "unassigned"}>
                    <TableCell variant="admin">{row.salesperson_name}</TableCell>
                    <TableCell variant="admin">{money(row.sales, row.currency_code)}</TableCell>
                    <TableCell variant="admin">{number(row.jobs, 0)}</TableCell>
                    <TableCell variant="admin">{number(row.sqft)}</TableCell>
                    <TableCell variant="admin">{money(row.open_balance, row.currency_code)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableViewport>
        </ComponentCard>

        <ComponentCard title="Material Mix" desc="Stone type and square footage from canonical Countertop configurations.">
          <TableViewport>
            <Table variant="admin">
              <TableHeader variant="admin">
                <TableRow>
                  <TableCell isHeader variant="admin">Material</TableCell>
                  <TableCell isHeader variant="admin">Jobs</TableCell>
                  <TableCell isHeader variant="admin">Sq. Ft.</TableCell>
                </TableRow>
              </TableHeader>
              <TableBody variant="admin">
                {loading ? <TableStateRow colSpan={3}>Loading material mix…</TableStateRow> : null}
                {!loading && (report?.materials.length ?? 0) === 0 ? <TableStateRow colSpan={3}>No countertop material exists for these jobs.</TableStateRow> : null}
                {report?.materials.map((row) => (
                  <TableRow key={row.material}>
                    <TableCell variant="admin">{row.material}</TableCell>
                    <TableCell variant="admin">{number(row.jobs, 0)}</TableCell>
                    <TableCell variant="admin">{number(row.sqft)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableViewport>
        </ComponentCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <ComponentCard title="Territory / Location" desc="Project address is preferred, then Order shipping and billing snapshots.">
          <TableViewport>
            <Table variant="admin" minWidth="wide">
              <TableHeader variant="admin">
                <TableRow>
                  <TableCell isHeader variant="admin">Location</TableCell>
                  <TableCell isHeader variant="admin">Sales</TableCell>
                  <TableCell isHeader variant="admin">Jobs</TableCell>
                  <TableCell isHeader variant="admin">Sq. Ft.</TableCell>
                  <TableCell isHeader variant="admin">Open Balance</TableCell>
                </TableRow>
              </TableHeader>
              <TableBody variant="admin">
                {loading ? <TableStateRow colSpan={5}>Loading territory performance…</TableStateRow> : null}
                {!loading && (report?.locations.length ?? 0) === 0 ? <TableStateRow colSpan={5}>No locations match the filters.</TableStateRow> : null}
                {report?.locations.map((row) => (
                  <TableRow key={row.location}>
                    <TableCell variant="admin">{row.location}</TableCell>
                    <TableCell variant="admin">{money(row.sales, row.currency_code)}</TableCell>
                    <TableCell variant="admin">{number(row.jobs, 0)}</TableCell>
                    <TableCell variant="admin">{number(row.sqft)}</TableCell>
                    <TableCell variant="admin">{money(row.open_balance, row.currency_code)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableViewport>
        </ComponentCard>

        <ComponentCard title="Payment Status" desc="Only issued/partial/overdue/paid Invoice rows contribute receivable balances. Draft Invoices are not treated as debt.">
          <TableViewport>
            <Table variant="admin">
              <TableHeader variant="admin">
                <TableRow>
                  <TableCell isHeader variant="admin">Status</TableCell>
                  <TableCell isHeader variant="admin">Jobs</TableCell>
                  <TableCell isHeader variant="admin">Open Balance</TableCell>
                </TableRow>
              </TableHeader>
              <TableBody variant="admin">
                {loading ? <TableStateRow colSpan={3}>Loading payment status…</TableStateRow> : null}
                {!loading && (report?.payment_statuses.length ?? 0) === 0 ? <TableStateRow colSpan={3}>No payment status data is available.</TableStateRow> : null}
                {report?.payment_statuses.map((row) => (
                  <TableRow key={row.status}>
                    <TableCell variant="admin"><Badge color={PAYMENT_COLORS[row.status]}>{paymentLabel(row.status)}</Badge></TableCell>
                    <TableCell variant="admin">{number(row.jobs, 0)}</TableCell>
                    <TableCell variant="admin">{money(row.open_balance, row.currency_code)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableViewport>
        </ComponentCard>
      </div>

      <ComponentCard title="Needs Attention" desc="Outstanding/overdue receivables, missing salesperson assignments and missing locations are surfaced without inventing workflow statuses.">
        <TableViewport>
          <Table variant="admin" minWidth="wide">
            <TableHeader variant="admin">
              <TableRow>
                <TableCell isHeader variant="admin">Order</TableCell>
                <TableCell isHeader variant="admin">Customer</TableCell>
                <TableCell isHeader variant="admin">Date</TableCell>
                <TableCell isHeader variant="admin">Salesperson</TableCell>
                <TableCell isHeader variant="admin">Status</TableCell>
                <TableCell isHeader variant="admin">Open Balance</TableCell>
                <TableCell isHeader variant="admin">Reason</TableCell>
              </TableRow>
            </TableHeader>
            <TableBody variant="admin">
              {loading ? <TableStateRow colSpan={7}>Loading attention items…</TableStateRow> : null}
              {!loading && (report?.attention.length ?? 0) === 0 ? <TableStateRow colSpan={7}>No jobs currently need attention under these rules.</TableStateRow> : null}
              {report?.attention.map((row) => (
                <TableRow key={row.order_id}>
                  <TableCell variant="admin">{row.order_number}</TableCell>
                  <TableCell variant="admin">{row.customer_name}</TableCell>
                  <TableCell variant="admin">{formatDateOnly(row.order_date)}</TableCell>
                  <TableCell variant="admin">{row.salesperson_name}</TableCell>
                  <TableCell variant="admin"><Badge color={PAYMENT_COLORS[row.payment_status]}>{paymentLabel(row.payment_status)}</Badge></TableCell>
                  <TableCell variant="admin">{money(row.open_balance, row.currency_code)}</TableCell>
                  <TableCell variant="admin">{row.reasons.join(" · ")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableViewport>
      </ComponentCard>

      <ComponentCard title="Job Detail" desc="Order-level source detail. Project data is enrichment only, so legacy/non-Project Orders remain visible.">
        <TableViewport>
          <Table variant="admin" minWidth="wide">
            <TableHeader variant="admin">
              <TableRow>
                <TableCell isHeader variant="admin">Date</TableCell>
                <TableCell isHeader variant="admin">Order</TableCell>
                <TableCell isHeader variant="admin">Project</TableCell>
                <TableCell isHeader variant="admin">Customer</TableCell>
                <TableCell isHeader variant="admin">Salesperson</TableCell>
                <TableCell isHeader variant="admin">Location</TableCell>
                <TableCell isHeader variant="admin">Material</TableCell>
                <TableCell isHeader variant="admin">Sq. Ft.</TableCell>
                <TableCell isHeader variant="admin">Sales</TableCell>
                <TableCell isHeader variant="admin">Payment</TableCell>
                <TableCell isHeader variant="admin">Open Balance</TableCell>
              </TableRow>
            </TableHeader>
            <TableBody variant="admin">
              {loading ? <TableStateRow colSpan={11}>Loading job detail…</TableStateRow> : null}
              {!loading && (report?.rows.length ?? 0) === 0 ? <TableStateRow colSpan={11}>No jobs match the selected filters.</TableStateRow> : null}
              {report?.rows.map((row) => (
                <TableRow key={row.order_id}>
                  <TableCell variant="admin">{formatDateOnly(row.order_date)}</TableCell>
                  <TableCell variant="admin">{row.order_number}</TableCell>
                  <TableCell variant="admin">{row.project_number || "—"}</TableCell>
                  <TableCell variant="admin">{row.customer_name}</TableCell>
                  <TableCell variant="admin">{row.salesperson_name}</TableCell>
                  <TableCell variant="admin">{row.location}</TableCell>
                  <TableCell variant="admin">{row.material_types.length ? row.material_types.join(", ") : "—"}</TableCell>
                  <TableCell variant="admin">{number(row.sqft)}</TableCell>
                  <TableCell variant="admin">{money(row.sales_amount, row.currency_code)}</TableCell>
                  <TableCell variant="admin"><Badge color={PAYMENT_COLORS[row.payment_status]}>{paymentLabel(row.payment_status)}</Badge></TableCell>
                  <TableCell variant="admin">{money(row.open_balance, row.currency_code)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableViewport>
        <div className={`flex flex-wrap items-center justify-between gap-3 text-sm ${ADMIN_TEXT_STYLES.muted}`}>
          <span>{totalCount} job(s) · showing {totalCount === 0 ? 0 : offset + 1}–{Math.min(offset + PAGE_SIZE, totalCount)}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={loading || offset === 0} onClick={() => changePage(offset - PAGE_SIZE)}>Previous</Button>
            <Button size="sm" variant="outline" disabled={loading || offset + PAGE_SIZE >= totalCount} onClick={() => changePage(offset + PAGE_SIZE)}>Next</Button>
          </div>
        </div>
      </ComponentCard>
    </div>
  );
}