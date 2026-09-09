"use client";

import dynamic from "next/dynamic";
import type { ApexOptions } from "apexcharts";
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

const ReactApexChart = dynamic(() => import("react-apexcharts"), { ssr: false });
const PAGE_SIZE = 50;

type ReportTab = "overview" | "collections" | "jobs";

type RankedBarItem = {
  label: string;
  value: number;
  valueText: string;
  meta?: string;
};

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

function monthLabel(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" }).format(date);
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

function Metric({ title, value }: { title: string; value: string }) {
  return (
    <ComponentCard title={title}>
      <p className={`text-2xl font-semibold ${ADMIN_TEXT_STYLES.strong}`}>{value}</p>
    </ComponentCard>
  );
}

function SalesTrendChart({
  rows,
  loading,
}: {
  rows: SalesProductionReportData["trend"];
  loading: boolean;
}) {
  if (loading) {
    return <div className={`flex h-[260px] items-center justify-center text-sm ${ADMIN_TEXT_STYLES.muted}`}>Loading sales trend…</div>;
  }
  if (rows.length === 0) {
    return <div className={`flex h-[260px] items-center justify-center text-sm ${ADMIN_TEXT_STYLES.muted}`}>No jobs match this reporting period.</div>;
  }
  if (rows.some((row) => row.sales === null)) {
    return (
      <div className={`flex h-[260px] items-center justify-center px-6 text-center text-sm ${ADMIN_TEXT_STYLES.muted}`}>
        Sales trend is unavailable while the selected period contains mixed currencies.
      </div>
    );
  }

  const currency = rows[0]?.currency_code ?? "USD";
  const options: ApexOptions = {
    chart: {
      fontFamily: "Outfit, sans-serif",
      toolbar: { show: false },
      zoom: { enabled: false },
      foreColor: "#667085",
    },
    dataLabels: { enabled: false },
    stroke: { curve: "smooth", width: 3 },
    fill: {
      type: "gradient",
      gradient: { opacityFrom: 0.28, opacityTo: 0.04, stops: [0, 95, 100] },
    },
    markers: { size: 4 },
    grid: { strokeDashArray: 4 },
    xaxis: {
      categories: rows.map((row) => monthLabel(row.period_start)),
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: {
      labels: {
        formatter: (value) => new Intl.NumberFormat("en-US", {
          notation: "compact",
          maximumFractionDigits: 1,
        }).format(value),
      },
    },
    tooltip: {
      y: { formatter: (value) => money(value, currency) },
    },
  };
  const series = [{ name: "Sales", data: rows.map((row) => row.sales ?? 0) }];

  return <ReactApexChart options={options} series={series} type="area" height={260} />;
}

function RankedBars({
  items,
  loading,
  emptyText,
}: {
  items: RankedBarItem[];
  loading: boolean;
  emptyText: string;
}) {
  if (loading) {
    return <p className={`py-8 text-center text-sm ${ADMIN_TEXT_STYLES.muted}`}>Loading…</p>;
  }
  if (items.length === 0) {
    return <p className={`py-8 text-center text-sm ${ADMIN_TEXT_STYLES.muted}`}>{emptyText}</p>;
  }

  const visibleItems = items.slice(0, 6);
  const maxValue = Math.max(...visibleItems.map((item) => item.value), 0);

  return (
    <div className="space-y-5">
      {visibleItems.map((item) => {
        const width = maxValue > 0 ? Math.max((item.value / maxValue) * 100, 2) : 0;
        return (
          <div key={item.label}>
            <div className="flex items-start justify-between gap-4 text-sm">
              <div className="min-w-0">
                <p className={`truncate font-medium ${ADMIN_TEXT_STYLES.strong}`}>{item.label}</p>
                {item.meta ? <p className={`mt-0.5 text-xs ${ADMIN_TEXT_STYLES.muted}`}>{item.meta}</p> : null}
              </div>
              <span className={`shrink-0 font-medium ${ADMIN_TEXT_STYLES.strong}`}>{item.valueText}</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
              <div className="h-full rounded-full bg-brand-500" style={{ width: `${width}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function SalesProductionReport() {
  const initialFilters = useMemo(defaultFilters, []);
  const [activeTab, setActiveTab] = useState<ReportTab>("overview");
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

  const salespersonBars = useMemo<RankedBarItem[]>(
    () => (report?.salespeople ?? []).map((row) => ({
      label: row.salesperson_name,
      value: row.sales ?? 0,
      valueText: money(row.sales, row.currency_code),
      meta: `${number(row.jobs, 0)} jobs · ${number(row.sqft)} sq. ft.`,
    })).sort((a, b) => b.value - a.value),
    [report],
  );
  const materialBars = useMemo<RankedBarItem[]>(
    () => (report?.materials ?? []).map((row) => ({
      label: row.material,
      value: row.sqft,
      valueText: `${number(row.sqft)} sq. ft.`,
      meta: `${number(row.jobs, 0)} jobs`,
    })).sort((a, b) => b.value - a.value),
    [report],
  );
  const locationBars = useMemo<RankedBarItem[]>(
    () => (report?.locations ?? []).map((row) => ({
      label: row.location,
      value: row.sales ?? 0,
      valueText: money(row.sales, row.currency_code),
      meta: `${number(row.jobs, 0)} jobs · ${number(row.sqft)} sq. ft.`,
    })).sort((a, b) => b.value - a.value),
    [report],
  );
  const paymentBars = useMemo<RankedBarItem[]>(
    () => (report?.payment_statuses ?? []).map((row) => ({
      label: paymentLabel(row.status),
      value: row.jobs,
      valueText: `${number(row.jobs, 0)} jobs`,
      meta: `Balance ${money(row.open_balance, row.currency_code)}`,
    })).sort((a, b) => b.value - a.value),
    [report],
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
    <div className="space-y-5">
      {error ? (
        <Alert
          variant="error"
          title="Sales & Production report unavailable"
          message={error}
          showLink
          linkHref="/reports/sales-production"
          linkText="Reload report"
        />
      ) : null}

      {summary?.mixed_currency ? (
        <Alert
          variant="warning"
          title="Mixed-currency monetary totals are unavailable"
          message="Modulex does not add unlike currencies or substitute a current FX rate. Job and production quantities remain available while affected monetary totals fail closed."
        />
      ) : null}

      <div role="tablist" aria-label="Sales & Production report views" className="flex flex-wrap gap-2">
        <Button size="sm" variant={activeTab === "overview" ? "primary" : "outline"} role="tab" aria-selected={activeTab === "overview"} onClick={() => setActiveTab("overview")}>Overview</Button>
        <Button size="sm" variant={activeTab === "collections" ? "primary" : "outline"} role="tab" aria-selected={activeTab === "collections"} onClick={() => setActiveTab("collections")}>Collections</Button>
        <Button size="sm" variant={activeTab === "jobs" ? "primary" : "outline"} role="tab" aria-selected={activeTab === "jobs"} onClick={() => setActiveTab("jobs")}>Jobs</Button>
      </div>

      <ComponentCard title="Filters" desc="Order date drives the reporting period. Filters stay active while you move between report views.">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
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
            <Select id="sales-production-salesperson" value={draftSalesRepId} options={salespersonOptions} allowEmpty placeholder="All salespeople" onChange={setDraftSalesRepId} />
          </div>
          <div>
            <Label htmlFor="sales-production-material">Material</Label>
            <Select id="sales-production-material" value={draftMaterial} options={materialOptions} allowEmpty placeholder="All materials" onChange={setDraftMaterial} />
          </div>
          <div>
            <Label htmlFor="sales-production-location">Location</Label>
            <Select id="sales-production-location" value={draftLocation} options={locationOptions} allowEmpty placeholder="All locations" onChange={setDraftLocation} />
          </div>
          <div>
            <Label htmlFor="sales-production-payment">Payment Status</Label>
            <Select id="sales-production-payment" value={draftPaymentStatus} options={paymentOptions} allowEmpty placeholder="All payment statuses" onChange={setDraftPaymentStatus} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={applyFilters} disabled={loading}>Apply Filters</Button>
          <Button size="sm" variant="outline" onClick={clearFilters} disabled={loading}>Reset</Button>
        </div>
      </ComponentCard>

      {activeTab === "overview" ? (
        <div role="tabpanel" aria-label="Overview" className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
            <Metric title="Sales" value={money(summary?.sales ?? null, currency)} />
            <Metric title="Jobs" value={number(summary?.jobs ?? 0, 0)} />
            <Metric title="Sq. Ft." value={number(summary?.sqft ?? 0)} />
            <Metric title="Avg Ticket" value={money(summary?.avg_ticket ?? null, currency)} />
            <Metric title="Open Balance" value={money(summary?.open_balance ?? null, currency)} />
            <Metric title="Jobs With Balance" value={number(summary?.jobs_with_balance ?? 0, 0)} />
          </div>

          <ComponentCard title="Sales Trend" desc="Monthly canonical sales for the selected reporting period.">
            <SalesTrendChart rows={report?.trend ?? []} loading={loading} />
          </ComponentCard>

          <div className="grid gap-5 xl:grid-cols-2">
            <ComponentCard title="Salesperson Performance" desc="Sales ranking with jobs and countertop square footage.">
              <RankedBars items={salespersonBars} loading={loading} emptyText="No salesperson activity in this period." />
            </ComponentCard>
            <ComponentCard title="Material Mix" desc="Countertop square footage by canonical stone type.">
              <RankedBars items={materialBars} loading={loading} emptyText="No countertop material exists for these jobs." />
            </ComponentCard>
            <ComponentCard title="Territory / Location" desc="Sales by Project address, with Order address fallback.">
              <RankedBars items={locationBars} loading={loading} emptyText="No locations match the filters." />
            </ComponentCard>
            <ComponentCard title="Payment Snapshot" desc="Job count by authoritative invoice payment state.">
              <RankedBars items={paymentBars} loading={loading} emptyText="No payment status data is available." />
            </ComponentCard>
          </div>
        </div>
      ) : null}

      {activeTab === "collections" ? (
        <div role="tabpanel" aria-label="Collections" className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Metric title="Open Balance" value={money(summary?.open_balance ?? null, currency)} />
            <Metric title="Jobs With Balance" value={number(summary?.jobs_with_balance ?? 0, 0)} />
            <Metric title="Needs Attention" value={number(summary?.needs_attention ?? 0, 0)} />
          </div>

          <ComponentCard title="Payment Status" desc="Issued, partially paid, overdue and paid Invoice rows provide receivable truth. Draft Invoices are not debt.">
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

          <ComponentCard title="Needs Attention" desc="Outstanding receivables and missing salesperson/location data are surfaced here without inventing workflow statuses.">
            {loading ? (
              <p className={`py-8 text-center text-sm ${ADMIN_TEXT_STYLES.muted}`}>Loading attention items…</p>
            ) : (report?.attention.length ?? 0) === 0 ? (
              <div className="rounded-xl border border-success-200 bg-success-50 px-4 py-4 dark:border-success-500/30 dark:bg-success-500/10">
                <p className="font-medium text-success-700 dark:text-success-300">No jobs currently need attention</p>
                <p className={`mt-1 text-sm ${ADMIN_TEXT_STYLES.muted}`}>No open or overdue receivable, missing salesperson, or missing location is present under the selected filters.</p>
              </div>
            ) : (
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
            )}
          </ComponentCard>
        </div>
      ) : null}

      {activeTab === "jobs" ? (
        <div role="tabpanel" aria-label="Jobs">
          <ComponentCard title="Job Detail" desc="Order-level source detail. Project data is enrichment only, so legacy and non-Project Orders remain visible.">
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
      ) : null}
    </div>
  );
}
