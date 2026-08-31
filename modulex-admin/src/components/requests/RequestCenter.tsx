"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import ComponentCard from "@/components/common/ComponentCard";
import Label from "@/components/form/Label";
import Select from "@/components/form/Select";
import Input from "@/components/form/input/InputField";
import TextArea from "@/components/form/input/TextArea";
import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
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

const statusBadgeColors: Record<RequestStatus, "primary" | "warning" | "success"> = {
  open: "primary",
  in_progress: "warning",
  completed: "success",
};

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
      <div className="mt-5">
        <ComponentCard title="Request Center" desc="Create, track and resolve internal requests.">
          <Alert variant="info" title="Loading requests" message="Request data is being loaded." />
        </ComponentCard>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="mt-5">
        <ComponentCard title="Request Center" desc="Create, track and resolve internal requests.">
          <div className="space-y-4">
            <Alert
              variant="error"
              title="Request Center access unavailable"
              message={error ?? "Request Center access is unavailable."}
            />
            <Button variant="outline" onClick={() => void load({ initial: true })}>
              Try again
            </Button>
          </div>
        </ComponentCard>
      </div>
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
          <ComponentCard key={String(label)} title={String(label)}>
            <p className="text-2xl font-semibold text-gray-800 dark:text-white/90">{value}</p>
          </ComponentCard>
        ))}
      </div>

      {error ? (
        <div className="space-y-3">
          <Alert variant="error" title="Request Center action failed" message={error} />
          <Button variant="outline" onClick={() => void load()}>
            Try again
          </Button>
        </div>
      ) : null}

      {message ? (
        <Alert variant="success" title="Request Center updated" message={message} />
      ) : null}

      <ComponentCard
        title="New request"
        desc="Describe the work you need. Request managers are notified immediately, and you will receive in-app updates when an admin acts on the request."
      >
        <form onSubmit={createRequest} className="grid gap-4 lg:grid-cols-2">
          <div>
            <Label htmlFor="request-title">Title</Label>
            <Input
              id="request-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              minLength={3}
              maxLength={160}
              required
              placeholder="What do you need?"
            />
          </div>

          <div>
            <Label htmlFor="request-category">Category</Label>
            <Select
              id="request-category"
              value={category}
              options={Object.entries(categoryLabels).map(([value, label]) => ({ value, label }))}
              onChange={(value) => setCategory(value as RequestCategory)}
            />
          </div>

          <div className="lg:col-span-2">
            <Label htmlFor="request-description">Description</Label>
            <TextArea
              id="request-description"
              value={description}
              onChange={setDescription}
              minLength={3}
              maxLength={5000}
              required
              rows={4}
              placeholder="Add context, expected outcome and any relevant details."
            />
          </div>

          <div className="lg:col-span-2">
            <Button type="submit" className="w-full sm:w-auto" disabled={creating}>
              {creating ? "Saving..." : "Submit request"}
            </Button>
          </div>
        </form>
      </ComponentCard>

      <ComponentCard
        title={canManage ? "All requests" : "My requests"}
        desc={
          canManage
            ? "Manage incoming requests; changes notify only the original requester."
            : "Track the progress and resolution of your requests."
        }
      >
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-end">
          <div className="w-full sm:min-w-64 sm:max-w-sm">
            <Label htmlFor="request-search" className="sr-only">
              Search requests
            </Label>
            <Input
              id="request-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search requests"
            />
          </div>

          <div className="w-full sm:w-48">
            <Label htmlFor="request-status-filter" className="sr-only">
              Filter requests by status
            </Label>
            <Select
              id="request-status-filter"
              value={statusFilter}
              options={[
                { value: "all", label: "All statuses" },
                ...Object.entries(statusLabels).map(([value, label]) => ({ value, label })),
              ]}
              onChange={(value) => setStatusFilter(value as typeof statusFilter)}
            />
          </div>
        </div>

        <div className="space-y-3">
          {visible.length === 0 ? (
            <Alert
              variant="info"
              title="No requests found"
              message="No requests match the current filters."
            />
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
                        <Badge color={statusBadgeColors[request.status]} size="sm">
                          {statusLabels[request.status]}
                        </Badge>
                        <Badge color="light" size="sm">
                          {categoryLabels[request.category]}
                        </Badge>
                      </div>

                      {canManage ? (
                        <p className="mt-1 break-words text-xs text-gray-500 dark:text-gray-400">
                          {request.requester_name || "Unnamed user"}
                          {request.requester_email ? ` · ${request.requester_email}` : ""}
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
                    <div className="mt-4">
                      <Alert variant="success" title="Admin note" message={request.resolution_note} />
                    </div>
                  ) : null}

                  {canManage ? (
                    <div className="mt-4 grid gap-3 border-t border-gray-100 pt-4 dark:border-gray-800 lg:grid-cols-[180px_1fr_auto] lg:items-end">
                      <div>
                        <Label className="sr-only" htmlFor={`request-status-${request.id}`}>
                          Status for {request.title}
                        </Label>
                        <Select
                          id={`request-status-${request.id}`}
                          value={draft.status}
                          options={Object.entries(statusLabels).map(([value, label]) => ({ value, label }))}
                          onChange={(value) =>
                            setDrafts((current) => ({
                              ...current,
                              [request.id]: {
                                ...draft,
                                status: value as RequestStatus,
                              },
                            }))
                          }
                        />
                      </div>

                      <div>
                        <Label className="sr-only" htmlFor={`request-note-${request.id}`}>
                          Admin note for {request.title}
                        </Label>
                        <Input
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
                        />
                      </div>

                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full lg:w-auto"
                        onClick={() => void updateRequest(request)}
                        disabled={isUpdating}
                      >
                        {isUpdating ? "Saving..." : "Save"}
                      </Button>
                    </div>
                  ) : null}
                </article>
              );
            })
          )}
        </div>
      </ComponentCard>
    </div>
  );
}
