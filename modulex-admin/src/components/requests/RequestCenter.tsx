"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile, type Profile } from "@/lib/supabase/profile";
import { hasPermission } from "@/lib/auth/permissions";

type RequestStatus = "open" | "in_progress" | "completed";
type RequestCategory = "bug" | "development" | "operations" | "other";

type SupportRequest = {
  id: string;
  requester_id: string;
  requester_name: string | null;
  requester_email: string | null;
  title: string;
  category: RequestCategory;
  description: string;
  status: RequestStatus;
  resolution_note: string | null;
  completed_at: string | null;
  completed_by: string | null;
  created_at: string;
  updated_at: string;
};

const categoryLabels: Record<RequestCategory, string> = {
  bug: "Bug / Problem",
  development: "Development",
  operations: "Operations",
  other: "Other",
};

const statusLabels: Record<RequestStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  completed: "Completed",
};

const inputFocusClass =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900";

function statusClass(status: RequestStatus) {
  if (status === "completed") {
    return "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400";
  }
  if (status === "in_progress") {
    return "bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-400";
  }
  return "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400";
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function reportRequestError(context: string, error: unknown) {
  console.error(`[Request Center] ${context}`, error);
}

async function sendRequestCreatedEmail(requestId: string) {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) return false;

  const response = await fetch("/api/requests/notify-created", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ requestId }),
  });

  return response.ok;
}

export default function RequestCenter() {
  const searchParams = useSearchParams();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [requests, setRequests] = useState<SupportRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [updatingRequestIds, setUpdatingRequestIds] = useState<Set<string>>(
    () => new Set()
  );
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<RequestCategory>("development");
  const [description, setDescription] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | RequestStatus>("all");
  const [query, setQuery] = useState("");
  const [drafts, setDrafts] = useState<
    Record<string, { status: RequestStatus; resolution: string }>
  >({});
  const [highlightedRequestId, setHighlightedRequestId] = useState<string | null>(null);

  const canManage = hasPermission(profile?.roles, "requests.manage");

  const load = useCallback(async (options?: { initial?: boolean }) => {
    const initial = options?.initial === true;
    if (initial) setLoading(true);
    setError(null);

    const { profile: current, error: profileError } = await getCurrentProfile();
    if (profileError || !current) {
      reportRequestError("profile load failed", profileError);
      setProfile(null);
      setError("We couldn’t load your Request Center access. Please try again.");
      if (initial) setLoading(false);
      return;
    }
    setProfile(current);

    const { data, error: requestError } = await supabase
      .from("support_requests")
      .select(
        "id,requester_id,requester_name,requester_email,title,category,description,status,resolution_note,completed_at,completed_by,created_at,updated_at"
      )
      .order("created_at", { ascending: false });

    if (requestError) {
      reportRequestError("request load failed", requestError);
      setError("Requests are temporarily unavailable. Please try again.");
    } else {
      const rows = (data ?? []) as SupportRequest[];
      setRequests(rows);
      setDrafts(
        Object.fromEntries(
          rows.map((row) => [
            row.id,
            { status: row.status, resolution: row.resolution_note ?? "" },
          ])
        )
      );
    }

    if (initial) setLoading(false);
  }, []);

  useEffect(() => {
    void load({ initial: true });
  }, [load]);

  const requestedId = searchParams.get("request");

  useEffect(() => {
    if (loading || !requestedId) return;
    const target = document.getElementById(`request-${requestedId}`);
    if (!target) return;

    setHighlightedRequestId(requestedId);
    target.scrollIntoView({ behavior: "smooth", block: "center" });

    const timeoutId = window.setTimeout(() => {
      setHighlightedRequestId((current) =>
        current === requestedId ? null : current
      );
    }, 2400);

    return () => window.clearTimeout(timeoutId);
  }, [loading, requestedId, requests]);

  async function createRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creating) return;
    setCreating(true);
    setError(null);
    setMessage(null);

    try {
      const { data: createdData, error: createError } = await supabase.rpc(
        "create_support_request",
        {
          p_title: title.trim(),
          p_category: category,
          p_description: description.trim(),
        }
      );

      if (createError) {
        reportRequestError("request creation failed", createError);
        setError("We couldn’t submit your request. Please review it and try again.");
        return;
      }

      const created = createdData as SupportRequest | null;
      let emailSent = false;
      if (created?.id) {
        try {
          emailSent = await sendRequestCreatedEmail(created.id);
        } catch (emailError) {
          reportRequestError("request email delivery failed", emailError);
          emailSent = false;
        }
      }

      setTitle("");
      setCategory("development");
      setDescription("");
      setMessage(
        emailSent
          ? "Request submitted. Request managers were notified in-app and by email."
          : "Request submitted. Request managers were notified in-app; email delivery could not be confirmed."
      );
      await load();
    } finally {
      setCreating(false);
    }
  }

  async function updateRequest(request: SupportRequest) {
    const draft = drafts[request.id];
    if (!draft || updatingRequestIds.has(request.id)) return;
    const resolution = draft.resolution.trim();
    if (draft.status === "completed" && !resolution) {
      setError("Add a resolution note before completing the request.");
      return;
    }
    if (
      draft.status === request.status &&
      resolution === (request.resolution_note ?? "").trim()
    ) {
      setError(null);
      setMessage("No changes to save.");
      return;
    }

    setUpdatingRequestIds((current) => {
      const next = new Set(current);
      next.add(request.id);
      return next;
    });
    setError(null);
    setMessage(null);

    try {
      const { error: updateError } = await supabase.rpc(
        "update_support_request_status",
        {
          p_request_id: request.id,
          p_status: draft.status,
          p_resolution_note: resolution || null,
        }
      );

      if (updateError) {
        reportRequestError("request update failed", updateError);
        setError("We couldn’t update this request. Please try again.");
        return;
      }

      setMessage(
        draft.status === "completed"
          ? "Request completed and requester notified."
          : "Request updated and requester notified."
      );
      await load();
    } finally {
      setUpdatingRequestIds((current) => {
        const next = new Set(current);
        next.delete(request.id);
        return next;
      });
    }
  }

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return requests.filter((request) => {
      if (statusFilter !== "all" && request.status !== statusFilter) return false;
      if (!needle) return true;
      return [
        request.title,
        request.description,
        request.requester_name ?? "",
        request.requester_email ?? "",
      ].some((value) => value.toLowerCase().includes(needle));
    });
  }, [requests, statusFilter, query]);

  const counts = useMemo(
    () => ({
      open: requests.filter((item) => item.status === "open").length,
      inProgress: requests.filter((item) => item.status === "in_progress").length,
      completed: requests.filter((item) => item.status === "completed").length,
    }),
    [requests]
  );

  if (loading) {
    return (
      <section className="mt-5 rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
        Loading requests...
      </section>
    );
  }

  if (!profile) {
    return (
      <section className="mt-5 rounded-2xl border border-error-200 bg-error-50 p-5 text-sm text-error-700 dark:border-error-500/20 dark:bg-error-500/10 dark:text-error-400 sm:p-6">
        <p role="alert">{error ?? "Request Center access is unavailable."}</p>
        <button
          type="button"
          onClick={() => void load({ initial: true })}
          className={`mt-4 inline-flex h-10 items-center justify-center rounded-lg border border-error-300 px-4 font-medium transition hover:bg-error-100 dark:border-error-500/30 dark:hover:bg-error-500/10 ${inputFocusClass}`}
        >
          Try again
        </button>
      </section>
    );
  }

  return (
    <div className="mt-5 space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ["Open", counts.open],
          ["In progress", counts.inProgress],
          ["Completed", counts.completed],
        ].map(([label, value]) => (
          <div
            key={String(label)}
            className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900"
          >
            <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-gray-800 dark:text-white/90">
              {value}
            </p>
          </div>
        ))}
      </div>

      {error ? (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-500/20 dark:bg-error-500/10 dark:text-error-400 sm:flex-row sm:items-center sm:justify-between"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() => void load()}
            className={`shrink-0 rounded-lg border border-error-300 px-3 py-2 font-medium transition hover:bg-error-100 dark:border-error-500/30 dark:hover:bg-error-500/10 ${inputFocusClass}`}
          >
            Try again
          </button>
        </div>
      ) : null}

      {message ? (
        <div
          role="status"
          aria-live="polite"
          className="rounded-xl border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700 dark:border-success-500/20 dark:bg-success-500/10 dark:text-success-400"
        >
          {message}
        </div>
      ) : null}

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900 sm:p-6">
        <div>
          <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
            New request
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Describe the work you need. Request managers are notified immediately, and you will receive in-app updates when an admin acts on the request.
          </p>
        </div>
        <form onSubmit={createRequest} className="mt-5 grid gap-4 lg:grid-cols-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Title
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              minLength={3}
              maxLength={160}
              required
              className={`mt-2 h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 outline-none transition focus:border-brand-500 dark:border-gray-700 dark:text-white/90 ${inputFocusClass}`}
              placeholder="What do you need?"
            />
          </label>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Category
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value as RequestCategory)}
              className={`mt-2 h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 outline-none transition focus:border-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 ${inputFocusClass}`}
            >
              {Object.entries(categoryLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 lg:col-span-2">
            Description
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              minLength={3}
              maxLength={5000}
              required
              rows={4}
              className={`mt-2 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-3 text-sm text-gray-800 outline-none transition focus:border-brand-500 dark:border-gray-700 dark:text-white/90 ${inputFocusClass}`}
              placeholder="Add context, expected outcome and any relevant details."
            />
          </label>
          <div className="lg:col-span-2">
            <button
              disabled={creating}
              className={`inline-flex h-11 w-full items-center justify-center rounded-lg bg-brand-500 px-5 text-sm font-medium text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto ${inputFocusClass}`}
            >
              {creating ? "Saving..." : "Submit request"}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
              {canManage ? "All requests" : "My requests"}
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {canManage
                ? "Manage incoming requests; changes notify only the original requester."
                : "Track the progress and resolution of your requests."}
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
            <div className="w-full sm:min-w-64">
              <label htmlFor="request-search" className="sr-only">
                Search requests
              </label>
              <input
                id="request-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search requests"
                className={`h-10 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 outline-none transition focus:border-brand-500 dark:border-gray-700 dark:text-white/90 ${inputFocusClass}`}
              />
            </div>
            <div className="w-full sm:w-auto sm:min-w-40">
              <label htmlFor="request-status-filter" className="sr-only">
                Filter requests by status
              </label>
              <select
                id="request-status-filter"
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as typeof statusFilter)
                }
                className={`h-10 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 outline-none transition focus:border-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 ${inputFocusClass}`}
              >
                <option value="all">All statuses</option>
                {Object.entries(statusLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {visible.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 px-5 py-10 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
              No requests found.
            </div>
          ) : (
            visible.map((request) => {
              const draft = drafts[request.id] ?? {
                status: request.status,
                resolution: request.resolution_note ?? "",
              };
              const isUpdating = updatingRequestIds.has(request.id);
              const isHighlighted = highlightedRequestId === request.id;

              return (
                <article
                  key={request.id}
                  id={`request-${request.id}`}
                  className={`rounded-xl border border-gray-200 p-4 transition-shadow dark:border-gray-800 sm:p-5 ${
                    isHighlighted
                      ? "ring-2 ring-brand-500 ring-offset-2 dark:ring-offset-gray-900"
                      : ""
                  }`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="break-words font-medium text-gray-800 dark:text-white/90">
                          {request.title}
                        </h3>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(request.status)}`}
                        >
                          {statusLabels[request.status]}
                        </span>
                        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-600 dark:bg-white/5 dark:text-gray-300">
                          {categoryLabels[request.category]}
                        </span>
                      </div>
                      {canManage ? (
                        <p className="mt-1 break-words text-xs text-gray-500 dark:text-gray-400">
                          {request.requester_name || "Unnamed user"}
                          {request.requester_email
                            ? ` · ${request.requester_email}`
                            : ""}
                        </p>
                      ) : null}
                      <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-gray-600 dark:text-gray-300">
                        {request.description}
                      </p>
                    </div>
                    <p className="shrink-0 text-xs text-gray-400 dark:text-gray-500">
                      {formatDate(request.created_at)}
                    </p>
                  </div>

                  {request.resolution_note ? (
                    <div className="mt-4 break-words rounded-lg bg-success-50 px-4 py-3 text-sm text-success-700 dark:bg-success-500/10 dark:text-success-400">
                      <span className="font-medium">Admin note: </span>
                      {request.resolution_note}
                    </div>
                  ) : null}

                  {canManage ? (
                    <div className="mt-4 grid gap-3 border-t border-gray-100 pt-4 dark:border-gray-800 lg:grid-cols-[180px_1fr_auto]">
                      <label className="sr-only" htmlFor={`request-status-${request.id}`}>
                        Status for {request.title}
                      </label>
                      <select
                        id={`request-status-${request.id}`}
                        value={draft.status}
                        onChange={(event) =>
                          setDrafts((current) => ({
                            ...current,
                            [request.id]: {
                              ...draft,
                              status: event.target.value as RequestStatus,
                            },
                          }))
                        }
                        className={`h-10 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 outline-none transition focus:border-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 ${inputFocusClass}`}
                      >
                        {Object.entries(statusLabels).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                      <label className="sr-only" htmlFor={`request-note-${request.id}`}>
                        Admin note for {request.title}
                      </label>
                      <input
                        id={`request-note-${request.id}`}
                        value={draft.resolution}
                        onChange={(event) =>
                          setDrafts((current) => ({
                            ...current,
                            [request.id]: {
                              ...draft,
                              resolution: event.target.value,
                            },
                          }))
                        }
                        placeholder="Admin note (required when completed)"
                        className={`h-10 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 outline-none transition focus:border-brand-500 dark:border-gray-700 dark:text-white/90 ${inputFocusClass}`}
                      />
                      <button
                        type="button"
                        onClick={() => void updateRequest(request)}
                        disabled={isUpdating}
                        className={`h-10 w-full rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03] lg:w-auto ${inputFocusClass}`}
                      >
                        {isUpdating ? "Saving..." : "Save"}
                      </button>
                    </div>
                  ) : null}
                </article>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
