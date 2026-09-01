"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import Label from "@/components/form/Label";
import Select from "@/components/form/Select";
import TextArea from "@/components/form/input/TextArea";
import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile, type UserRole } from "@/lib/supabase/profile";

type ApprovalStatus = "pending" | "approved" | "rejected" | "cancelled";
type ApprovalBadgeColor = "success" | "error" | "warning" | "light";

type ApprovalRow = {
  id: string;
  request_type: string;
  entity_type: "order" | "customer" | "invoice";
  entity_id: string;
  entity_label: string | null;
  status: ApprovalStatus;
  request_reason: string | null;
  current_snapshot: Record<string, unknown>;
  proposed_changes: Record<string, unknown>;
  risk_summary: Record<string, unknown>;
  requested_by: string;
  requested_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
};

type ProfileRow = { id: string; full_name: string | null; email: string | null };
type EntityLink = { href: string; label: string };

function titleCase(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function dateTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function statusColor(status: ApprovalStatus): ApprovalBadgeColor {
  if (status === "approved") return "success";
  if (status === "rejected") return "error";
  if (status === "pending") return "warning";
  return "light";
}

function reasonRows(row: ApprovalRow) {
  const reasons = row.risk_summary?.reasons;
  return Array.isArray(reasons) ? (reasons as Array<Record<string, unknown>>) : [];
}

function warningRows(row: ApprovalRow) {
  const warnings = row.risk_summary?.warnings;
  return Array.isArray(warnings) ? (warnings as Array<Record<string, unknown>>) : [];
}

function proposedSummary(row: ApprovalRow) {
  const p = row.proposed_changes ?? {};
  if (row.request_type === "order_status_change") {
    return p.status ? `Requested status: ${titleCase(String(p.status))}` : "Status change";
  }
  if (row.request_type === "invoice_change") {
    const parts = [
      p.status ? `Status: ${titleCase(String(p.status))}` : null,
      p.paid_amount != null ? `Paid amount: ${p.paid_amount}` : null,
    ].filter(Boolean);
    return parts.join(" · ") || "Invoice change";
  }
  if (row.request_type === "customer_commercial_change") {
    const parts = [
      p.credit_limit != null ? `Credit limit: ${p.credit_limit}` : null,
      p.payment_term_id ? "Payment terms changed" : null,
      p.credit_hold === false ? "Credit hold release" : null,
      p.tax_exempt === true ? "Tax exempt" : null,
    ].filter(Boolean);
    return parts.join(" · ") || "Commercial settings change";
  }
  if (row.request_type === "customer_price_group_change") {
    return "Customer default price group change is waiting for approval.";
  }
  if (row.request_type === "order_revision") {
    return "Proposed revision is waiting; the live order has not been changed.";
  }
  if (row.request_type === "order_exception") {
    return "Draft order contains an exception that must be approved before confirmation.";
  }
  return "Approval required";
}

export default function ApprovalRequestsManager() {
  const [role, setRole] = useState<UserRole | null>(null);
  const [rows, setRows] = useState<ApprovalRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [links, setLinks] = useState<Record<string, EntityLink>>({});
  const [statusFilter, setStatusFilter] = useState<"all" | ApprovalStatus>("pending");
  const [typeFilter, setTypeFilter] = useState("all");
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    const { profile, error: profileError } = await getCurrentProfile();
    if (profileError || !profile) {
      setErrorMessage(profileError?.message || "Active staff profile is required.");
      setIsLoading(false);
      return;
    }
    setRole(profile.role);

    const [requestsResult, profilesResult] = await Promise.all([
      supabase.from("approval_requests").select("*").order("created_at", { ascending: false }).limit(150),
      supabase.from("profiles").select("id, full_name, email").eq("is_active", true),
    ]);
    if (requestsResult.error) {
      setErrorMessage(requestsResult.error.message);
      setIsLoading(false);
      return;
    }

    const nextRows = (requestsResult.data ?? []) as ApprovalRow[];
    setRows(nextRows);
    setProfiles((profilesResult.data ?? []) as ProfileRow[]);

    const orderIds = nextRows
      .filter((item) => item.entity_type === "order")
      .map((item) => item.entity_id);
    const invoiceIds = nextRows
      .filter((item) => item.entity_type === "invoice")
      .map((item) => item.entity_id);
    const [ordersResult, invoicesResult] = await Promise.all([
      orderIds.length
        ? supabase
            .from("customer_orders")
            .select("id, customer_id, order_number")
            .in("id", orderIds)
        : Promise.resolve({ data: [] }),
      invoiceIds.length
        ? supabase
            .from("customer_invoices")
            .select("id, customer_id, invoice_number")
            .in("id", invoiceIds)
        : Promise.resolve({ data: [] }),
    ]);
    const nextLinks: Record<string, EntityLink> = {};
    for (const item of (ordersResult.data ?? []) as Array<{
      id: string;
      customer_id: string;
      order_number: string;
    }>) {
      nextLinks[`order:${item.id}`] = {
        href: `/customers/${item.customer_id}/orders/${item.id}`,
        label: item.order_number,
      };
    }
    for (const item of (invoicesResult.data ?? []) as Array<{
      id: string;
      customer_id: string;
      invoice_number: string;
    }>) {
      nextLinks[`invoice:${item.id}`] = {
        href: `/customers/${item.customer_id}/invoices/${item.id}`,
        label: item.invoice_number,
      };
    }
    for (const item of nextRows.filter((entry) => entry.entity_type === "customer")) {
      nextLinks[`customer:${item.entity_id}`] = {
        href: `/customers/${item.entity_id}`,
        label: item.entity_label || "Customer",
      };
    }
    setLinks(nextLinks);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const profileMap = useMemo(
    () =>
      new Map(
        profiles.map((profile) => [
          profile.id,
          profile.full_name || profile.email || "User",
        ])
      ),
    [profiles]
  );
  const canReview = role === "super_admin" || role === "admin";
  const types = useMemo(() => [...new Set(rows.map((row) => row.request_type))], [rows]);
  const filtered = useMemo(
    () =>
      rows.filter(
        (row) =>
          (statusFilter === "all" || row.status === statusFilter) &&
          (typeFilter === "all" || row.request_type === typeFilter)
      ),
    [rows, statusFilter, typeFilter]
  );
  const counts = useMemo(
    () => ({
      pending: rows.filter((row) => row.status === "pending").length,
      approved: rows.filter((row) => row.status === "approved").length,
      rejected: rows.filter((row) => row.status === "rejected").length,
    }),
    [rows]
  );

  async function review(row: ApprovalRow, decision: "approved" | "rejected") {
    if (!canReview || workingId) return;
    setWorkingId(row.id);
    setErrorMessage(null);
    setSuccessMessage(null);
    const { data, error } = await supabase.rpc("review_approval_request", {
      p_request_id: row.id,
      p_decision: decision,
      p_note: reviewNotes[row.id]?.trim() || null,
    });
    if (error) {
      setErrorMessage(error.message);
      setWorkingId(null);
      return;
    }
    setSuccessMessage(
      data === "approved"
        ? "Request approved and the authorized change was applied."
        : "Request rejected; the live record was not changed."
    );
    setWorkingId(null);
    await load();
  }

  if (isLoading) {
    return (
      <ComponentCard
        title="Approvals"
        desc="Loading protected sales, order, customer and invoice changes."
      >
        <div className="flex min-h-[280px] items-center justify-center">
          <p role="status" className="text-sm text-gray-500 dark:text-gray-400">
            Loading approvals...
          </p>
        </div>
      </ComponentCard>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <Metric label="Pending" value={counts.pending} tone="warning" />
        <Metric label="Approved" value={counts.approved} tone="success" />
        <Metric label="Rejected" value={counts.rejected} tone="error" />
      </div>

      <div aria-live="polite" className="space-y-3">
        {errorMessage ? (
          <Alert variant="error" title="Approval action failed" message={errorMessage} />
        ) : null}
        {successMessage ? (
          <Alert variant="success" title="Approval updated" message={successMessage} />
        ) : null}
      </div>

      <ComponentCard
        title={canReview ? "Approval Queue" : "My Approval Requests"}
        desc="Financial and post-confirmation exceptions are held here before they can affect protected records."
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,220px)_minmax(0,280px)_auto] xl:items-end">
          <div>
            <Label htmlFor="approval-status-filter">Status</Label>
            <Select
              id="approval-status-filter"
              value={statusFilter}
              options={[
                { value: "pending", label: "Pending" },
                { value: "all", label: "All statuses" },
                { value: "approved", label: "Approved" },
                { value: "rejected", label: "Rejected" },
                { value: "cancelled", label: "Cancelled" },
              ]}
              onChange={(value) => setStatusFilter(value as typeof statusFilter)}
            />
          </div>

          <div>
            <Label htmlFor="approval-type-filter">Request type</Label>
            <Select
              id="approval-type-filter"
              value={typeFilter}
              options={[
                { value: "all", label: "All request types" },
                ...types.map((type) => ({ value: type, label: titleCase(type) })),
              ]}
              onChange={setTypeFilter}
            />
          </div>

          <div className="flex xl:justify-end">
            <Button type="button" size="sm" variant="outline" onClick={() => void load()}>
              Refresh
            </Button>
          </div>
        </div>
      </ComponentCard>

      {filtered.length === 0 ? (
        <ComponentCard title="Approval Requests">
          <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
            No approval requests match these filters.
          </p>
        </ComponentCard>
      ) : (
        <div className="space-y-4">
          {filtered.map((row) => {
            const reasons = reasonRows(row);
            const warnings = warningRows(row);
            const link = links[`${row.entity_type}:${row.entity_id}`];
            const noteId = `approval-review-note-${row.id}`;

            return (
              <article
                key={row.id}
                className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]"
              >
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge color={statusColor(row.status)} size="sm">
                        {titleCase(row.status)}
                      </Badge>
                      <Badge color="light" size="sm">
                        {titleCase(row.request_type)}
                      </Badge>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                        {row.entity_label || titleCase(row.entity_type)}
                      </h3>
                      {link ? (
                        <Link
                          href={link.href}
                          className="text-sm font-medium text-brand-500 transition hover:text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                        >
                          Open record →
                        </Link>
                      ) : null}
                    </div>

                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      Requested by {profileMap.get(row.requested_by) || "User"} ·{" "}
                      {dateTime(row.requested_at)}
                    </p>
                    <p className="mt-3 text-sm text-gray-700 dark:text-gray-300">
                      {row.request_reason || proposedSummary(row)}
                    </p>
                    <p className="mt-1 text-sm font-medium text-gray-700 dark:text-gray-300">
                      {proposedSummary(row)}
                    </p>

                    {reasons.length > 0 ? (
                      <div className="mt-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                          Approval reasons
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {reasons.map((reason, index) => (
                            <Badge
                              key={`${String(reason.type)}-${index}`}
                              color="warning"
                              size="sm"
                            >
                              {String(
                                reason.label || titleCase(String(reason.type || "exception"))
                              )}
                              {reason.sku ? ` · ${reason.sku}` : ""}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {warnings.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {warnings.map((warning, index) => (
                          <Badge
                            key={`${String(warning.type)}-${index}`}
                            color="light"
                            size="sm"
                          >
                            {String(warning.label || warning.type)}
                          </Badge>
                        ))}
                      </div>
                    ) : null}

                    {row.reviewed_at ? (
                      <div className="mt-4 rounded-xl bg-gray-50 p-3 text-sm text-gray-600 dark:bg-white/[0.03] dark:text-gray-300">
                        <span className="font-medium">
                          Reviewed by{" "}
                          {row.reviewed_by
                            ? profileMap.get(row.reviewed_by) || "Admin"
                            : "Admin"}
                        </span>{" "}
                        · {dateTime(row.reviewed_at)}
                        {row.review_note ? <p className="mt-1">{row.review_note}</p> : null}
                      </div>
                    ) : null}
                  </div>

                  {canReview && row.status === "pending" ? (
                    <div className="w-full shrink-0 xl:w-80">
                      <Label htmlFor={noteId}>Review note</Label>
                      <TextArea
                        id={noteId}
                        value={reviewNotes[row.id] || ""}
                        onChange={(value) =>
                          setReviewNotes((current) => ({
                            ...current,
                            [row.id]: value,
                          }))
                        }
                        rows={4}
                        placeholder="Optional approval/rejection note"
                      />
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={workingId === row.id}
                          onClick={() => void review(row, "rejected")}
                        >
                          Reject
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          disabled={workingId === row.id}
                          onClick={() => void review(row, "approved")}
                        >
                          {workingId === row.id ? "Applying..." : "Approve"}
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "warning" | "success" | "error";
}) {
  const toneClass =
    tone === "warning"
      ? "text-warning-600 dark:text-warning-400"
      : tone === "success"
        ? "text-success-600 dark:text-success-400"
        : "text-error-600 dark:text-error-400";

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`mt-2 text-3xl font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}
