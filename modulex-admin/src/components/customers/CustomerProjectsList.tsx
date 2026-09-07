"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ComponentCard from "@/components/common/ComponentCard";
import Input from "@/components/form/input/InputField";
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
  TableViewport,
} from "@/components/ui/table";
import { hasPermission } from "@/lib/auth/permissions";
import {
  createCustomerProject,
  listCustomerProjects,
  type CustomerProject,
  type ProjectStatus,
} from "@/lib/customers/project-domain";
import { loadCustomerRecord } from "@/lib/customers/read-dedup";
import type { Customer } from "@/lib/customers/types";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { formatTimestampDate } from "@/lib/dates/usDate";
import DateInput from "@/components/form/DateInput";

const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

function statusLabel(status: ProjectStatus) {
  return status.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function statusColor(status: ProjectStatus): "primary" | "success" | "warning" | "error" | "info" | "light" {
  if (status === "completed") return "success";
  if (status === "cancelled") return "error";
  if (status === "in_progress" || status === "ordered") return "info";
  if (status === "approved") return "primary";
  if (status === "quoted") return "warning";
  return "light";
}

function displayDate(value: string | null) {
  if (!value) return "—";
  return formatTimestampDate(value);
}

export default function CustomerProjectsList({ customerId }: { customerId: string }) {
  const router = useRouter();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [projects, setProjects] = useState<CustomerProject[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [totalCount, setTotalCount] = useState(0);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const startRow = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endRow = Math.min(currentPage * pageSize, totalCount);

  const pageSizeOptions = useMemo(
    () => PAGE_SIZE_OPTIONS.map((size) => ({ value: String(size), label: `${size} / page` })),
    []
  );

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [{ profile, error: profileError }, customerRecord, projectResult] = await Promise.all([
        getCurrentProfile(),
        loadCustomerRecord(customerId),
        listCustomerProjects({
          customerId,
          limit: pageSize,
          offset: (currentPage - 1) * pageSize,
        }),
      ]);
      if (profileError) throw profileError;
      setCanManage(Boolean(profile && hasPermission(profile.role, "projects.manage")));
      setCustomer(customerRecord);
      setProjects(projectResult.items);
      setTotalCount(projectResult.total_count);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Customer projects could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [currentPage, customerId, pageSize]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  async function createProject() {
    if (!canManage || !name.trim()) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const projectId = await createCustomerProject({
        customerId,
        name: name.trim(),
        salesRepId: customer?.sales_rep_id ?? null,
        targetDate: targetDate || null,
        status: "draft",
      });
      setName("");
      setTargetDate("");
      setMessage("Project created.");
      router.push(`/projects/${projectId}`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Project could not be created.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      {error ? <Alert variant="error" title="Project action failed" message={error} /> : null}
      {message ? <Alert variant="success" title="Project updated" message={message} /> : null}

      {canManage ? (
        <ComponentCard
          title="New Project"
          desc={`Create a Project directly for ${customer?.name ?? "this customer"}. The customer's assigned Sales Rep is used by default.`}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="customer-project-name">Project name</Label>
              <Input
                id="customer-project-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Kitchen Remodel"
              />
            </div>
            <div>
              <Label htmlFor="customer-project-target-date">Target date</Label>
              <DateInput
                id="customer-project-target-date"
                value={targetDate}
                onChange={(event) => setTargetDate(event)}
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={() => void createProject()} disabled={saving || !name.trim()}>
              {saving ? "Creating…" : "Create Project"}
            </Button>
          </div>
        </ComponentCard>
      ) : null}

      <ComponentCard
        title={customer ? `${customer.name} Projects` : "Customer Projects"}
        desc="Projects are the customer job container; each Project may contain multiple Orders."
      >
        {loading ? (
          <Alert variant="info" title="Loading projects" message="Customer projects are being loaded." />
        ) : projects.length === 0 ? (
          <Alert variant="info" title="No projects" message="This customer does not have a Project yet." />
        ) : (
          <TableViewport>
            <Table variant="admin" minWidth="standard">
              <TableHeader variant="admin">
                <TableRow>
                  <TableCell isHeader variant="admin">Project</TableCell>
                  <TableCell isHeader variant="admin">Status</TableCell>
                  <TableCell isHeader variant="admin">Sales Rep</TableCell>
                  <TableCell isHeader variant="admin">Target</TableCell>
                  <TableCell isHeader variant="admin">Updated</TableCell>
                  <TableCell isHeader variant="admin">Action</TableCell>
                </TableRow>
              </TableHeader>
              <TableBody variant="admin">
                {projects.map((project) => (
                  <TableRow key={project.id}>
                    <TableCell variant="admin">
                      <div className="font-medium">{project.name}</div>
                      <div className="text-xs">{project.project_number}</div>
                    </TableCell>
                    <TableCell variant="admin"><Badge color={statusColor(project.status)}>{statusLabel(project.status)}</Badge></TableCell>
                    <TableCell variant="admin">{project.sales_rep_name || "—"}</TableCell>
                    <TableCell variant="admin">{displayDate(project.target_date)}</TableCell>
                    <TableCell variant="admin">{displayDate(project.updated_at)}</TableCell>
                    <TableCell variant="admin">
                      <Button size="sm" variant="outline" onClick={() => router.push(`/projects/${project.id}`)}>Open</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableViewport>
        )}

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm">Showing {startRow}–{endRow} of {totalCount}</div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-full sm:w-36">
              <Select
                value={String(pageSize)}
                onChange={(value) => {
                  setPageSize(Number(value));
                  setCurrentPage(1);
                }}
                options={pageSizeOptions}
              />
            </div>
            <Button variant="outline" disabled={currentPage <= 1 || loading} onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}>Previous</Button>
            <span className="text-sm">{currentPage} / {totalPages}</span>
            <Button variant="outline" disabled={currentPage >= totalPages || loading} onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}>Next</Button>
          </div>
        </div>
      </ComponentCard>
    </div>
  );
}
