"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import Label from "@/components/form/Label";
import Select from "@/components/form/Select";
import Input from "@/components/form/input/InputField";
import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { ADMIN_SURFACE_CARD, ADMIN_TEXT_STYLES } from "@/components/ui/theme/adminTheme";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
  TableStateRow,
  TableViewport,
} from "@/components/ui/table";
import { getCustomerProject } from "@/lib/customers/project-domain";
import { getCustomerProjectCommissionEvents, type ProjectCommissionEventRow } from "@/lib/customers/project-commission-events";
import {
  appendCustomerProjectCommissionEvent,
  createCustomerProjectCommissionObligation,
  deactivateCustomerProjectParticipant,
  getCustomerProjectCommissionCalculationPreview,
  getCustomerProjectCommissions,
  getCustomerProjectParticipants,
  getProjectCommissionScopeOptions,
  getProjectParticipantAccess,
  getProjectParticipantCandidates,
  getProjectParticipantRoles,
  setCustomerProjectParticipant,
  type ProjectCommissionBasisType,
  type ProjectCommissionCalculationPreview,
  type ProjectCommissionEventType,
  type ProjectCommissionObligation,
  type ProjectCommissionScopeOption,
  type ProjectCommissionScopeType,
  type ProjectParticipant,
  type ProjectParticipantCandidate,
  type ProjectParticipantRole,
} from "@/lib/customers/project-participants-commission-domain";

type Props = { projectId: string };
type BadgeColor = "success" | "warning" | "error" | "info" | "light" | "primary";

function displayDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
}

function displayDateTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function money(value: number, currencyCode: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: currencyCode }).format(value);
  } catch {
    return `${currencyCode} ${value.toFixed(2)}`;
  }
}

function statusLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function commissionBadge(status: ProjectCommissionObligation["status"]): BadgeColor {
  if (status === "approved") return "success";
  if (status === "earned") return "primary";
  if (status === "cancelled") return "light";
  return "warning";
}

function basisLabel(commission: ProjectCommissionObligation) {
  if (commission.basisType === "fixed") {
    return `Fixed ${money(commission.flatAmount ?? commission.baseAmount, commission.currencyCode)}`;
  }
  if (commission.basisType === "gross_profit_percentage") {
    return `${commission.rate ?? 0}% of gross profit ${money(commission.basisAmount ?? 0, commission.currencyCode)}`;
  }
  return `${commission.rate ?? 0}% of sales ${money(commission.basisAmount ?? 0, commission.currencyCode)}`;
}

function payoutLabel(commission: ProjectCommissionObligation) {
  if (commission.paidAmount === null) return "Restricted or currency review required in Finance";
  return money(commission.paidAmount, commission.currencyCode);
}

function previewIssue(preview: ProjectCommissionCalculationPreview | null, fallback: string | null) {
  if (preview?.errorCode === "PROJECT_COMMISSION_COST_INCOMPLETE") {
    const count = preview.missingCostLineCount;
    return {
      title: "Incomplete cost data",
      detail: `${count} scoped Order line${count === 1 ? " is" : "s are"} missing a canonical current product cost. Add product costs before creating a gross-profit commission.`,
    };
  }
  if (preview?.errorCode === "PROJECT_COMMISSION_GROSS_PROFIT_NONPOSITIVE") {
    return {
      title: "Gross profit is not positive",
      detail: "Gross-profit commission requires scoped revenue to exceed canonical product cost.",
    };
  }
  if (fallback) return { title: "Commission preview could not be calculated", detail: fallback };
  return null;
}

export default function ProjectParticipantsCommissionPanel({ projectId }: Props) {
  const [participants, setParticipants] = useState<ProjectParticipant[]>([]);
  const [roles, setRoles] = useState<ProjectParticipantRole[]>([]);
  const [candidates, setCandidates] = useState<ProjectParticipantCandidate[]>([]);
  const [commissions, setCommissions] = useState<ProjectCommissionObligation[]>([]);
  const [commissionEvents, setCommissionEvents] = useState<ProjectCommissionEventRow[]>([]);
  const [categoryScopes, setCategoryScopes] = useState<ProjectCommissionScopeOption[]>([]);
  const [productScopes, setProductScopes] = useState<ProjectCommissionScopeOption[]>([]);
  const [canViewParticipants, setCanViewParticipants] = useState(false);
  const [canManageParticipants, setCanManageParticipants] = useState(false);
  const [canViewCommissions, setCanViewCommissions] = useState(false);
  const [canManageCommissions, setCanManageCommissions] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [participantRoleKey, setParticipantRoleKey] = useState("");
  const [participantCandidate, setParticipantCandidate] = useState("");
  const [participantNotes, setParticipantNotes] = useState("");

  const [commissionParticipantId, setCommissionParticipantId] = useState("");
  const [commissionBasisType, setCommissionBasisType] = useState<ProjectCommissionBasisType>("fixed");
  const [commissionScopeType, setCommissionScopeType] = useState<ProjectCommissionScopeType>("project");
  const [commissionScopeId, setCommissionScopeId] = useState("");
  const [commissionFlatAmount, setCommissionFlatAmount] = useState("");
  const [commissionPreview, setCommissionPreview] = useState<ProjectCommissionCalculationPreview | null>(null);
  const [commissionPreviewError, setCommissionPreviewError] = useState<string | null>(null);
  const [loadingCommissionPreview, setLoadingCommissionPreview] = useState(false);
  const [commissionRate, setCommissionRate] = useState("");
  const [commissionCurrency, setCommissionCurrency] = useState("USD");
  const [commissionDescription, setCommissionDescription] = useState("");

  const [eventObligationId, setEventObligationId] = useState("");
  const [eventType, setEventType] = useState<ProjectCommissionEventType>("earned");
  const [eventAmount, setEventAmount] = useState("");
  const [eventReason, setEventReason] = useState("");
  const [reversalEventId, setReversalEventId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [project, access] = await Promise.all([
        getCustomerProject(projectId),
        getProjectParticipantAccess(),
      ]);
      setCanViewParticipants(access.canViewParticipants);
      setCanManageParticipants(access.canManageParticipants);
      setCanViewCommissions(access.canViewCommissions);
      setCanManageCommissions(access.canManageCommissions);

      const [nextParticipants, nextRoles, nextCommissions, nextCandidates, scopeOptions] = await Promise.all([
        access.canViewParticipants ? getCustomerProjectParticipants(projectId) : Promise.resolve([]),
        access.canViewParticipants ? getProjectParticipantRoles() : Promise.resolve([]),
        access.canViewCommissions ? getCustomerProjectCommissions(projectId) : Promise.resolve([]),
        access.canManageParticipants ? getProjectParticipantCandidates(project.customer_id) : Promise.resolve([]),
        access.canManageCommissions
          ? getProjectCommissionScopeOptions(projectId)
          : Promise.resolve({ categories: [], products: [] }),
      ]);

      setParticipants(nextParticipants);
      setRoles(nextRoles);
      setCommissions(nextCommissions);
      setCandidates(nextCandidates);
      setCategoryScopes(scopeOptions.categories);
      setProductScopes(scopeOptions.products);

      if (!participantRoleKey) {
        const firstManualRole = nextRoles.find((role) => role.roleKey !== "sales_rep");
        if (firstManualRole) setParticipantRoleKey(firstManualRole.roleKey);
      }
      if (!commissionParticipantId) {
        const firstParticipant = nextParticipants.find((participant) => participant.isActive);
        if (firstParticipant) setCommissionParticipantId(firstParticipant.id);
      }
      if (!eventObligationId && nextCommissions.length > 0) {
        setEventObligationId(nextCommissions[0].obligationId);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Project Participants & Commission could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [commissionParticipantId, eventObligationId, participantRoleKey, projectId]);

  const loadEvents = useCallback(async () => {
    if (!canViewCommissions || !eventObligationId) {
      setCommissionEvents([]);
      return;
    }
    setLoadingEvents(true);
    try {
      setCommissionEvents(await getCustomerProjectCommissionEvents(eventObligationId));
    } catch (eventError) {
      setError(eventError instanceof Error ? eventError.message : "Commission event history could not be loaded.");
    } finally {
      setLoadingEvents(false);
    }
  }, [canViewCommissions, eventObligationId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setReversalEventId("");
    void loadEvents();
  }, [loadEvents]);

  useEffect(() => {
    let active = true;
    if (commissionBasisType === "fixed") {
      setCommissionPreview(null);
      setCommissionPreviewError(null);
      setLoadingCommissionPreview(false);
      return () => { active = false; };
    }
    if (commissionScopeType !== "project" && !commissionScopeId) {
      setCommissionPreview(null);
      setCommissionPreviewError(null);
      setLoadingCommissionPreview(false);
      return () => { active = false; };
    }
    if (!/^[A-Z]{3}$/.test(commissionCurrency.trim().toUpperCase())) {
      setCommissionPreview(null);
      setCommissionPreviewError("Enter a valid three-letter currency code.");
      setLoadingCommissionPreview(false);
      return () => { active = false; };
    }

    setLoadingCommissionPreview(true);
    setCommissionPreviewError(null);
    void getCustomerProjectCommissionCalculationPreview({
      projectId,
      basisType: commissionBasisType,
      scopeType: commissionScopeType,
      currencyCode: commissionCurrency,
      productCategoryId: commissionScopeType === "category" ? commissionScopeId || null : null,
      productId: commissionScopeType === "product" ? commissionScopeId || null : null,
    }).then((preview) => {
      if (active) setCommissionPreview(preview);
    }).catch((previewErrorValue) => {
      if (!active) return;
      setCommissionPreview(null);
      setCommissionPreviewError(previewErrorValue instanceof Error ? previewErrorValue.message : "Commission preview could not be calculated.");
    }).finally(() => {
      if (active) setLoadingCommissionPreview(false);
    });

    return () => { active = false; };
  }, [commissionBasisType, commissionCurrency, commissionScopeId, commissionScopeType, projectId]);

  const participantRoleOptions = useMemo(
    () => roles.filter((role) => role.roleKey !== "sales_rep").map((role) => ({ value: role.roleKey, label: role.label })),
    [roles],
  );
  const participantCandidateOptions = useMemo(
    () => candidates.map((candidate) => ({ value: candidate.value, label: candidate.label })),
    [candidates],
  );
  const commissionParticipantOptions = useMemo(
    () => participants.filter((participant) => participant.isActive).map((participant) => ({
      value: participant.id,
      label: `${participant.displayName} — ${participant.roleLabel}`,
    })),
    [participants],
  );
  const commissionOptions = useMemo(
    () => commissions.map((commission) => ({
      value: commission.obligationId,
      label: `${commission.participantName} — ${money(commission.currentAmount, commission.currencyCode)} — ${statusLabel(commission.status)}`,
    })),
    [commissions],
  );
  const scopeOptions = commissionScopeType === "category" ? categoryScopes : productScopes;
  const scopeSelectOptions = scopeOptions.map((option) => ({ value: option.id, label: option.label }));
  const selectedCommission = commissions.find((commission) => commission.obligationId === eventObligationId) ?? null;
  const reversalOptions = commissionEvents
    .filter((event) => ["adjustment", "offset"].includes(event.eventType) && !event.isReversed)
    .map((event) => ({
      value: event.eventId,
      label: `${statusLabel(event.eventType)} · ${event.amountDelta > 0 ? "+" : ""}${money(event.amountDelta, selectedCommission?.currencyCode ?? "USD")} · ${displayDateTime(event.createdAt)}`,
    }));

  const numericRate = Number(commissionRate);
  const estimatedCommission = commissionPreview?.basisAmount !== null
    && commissionPreview?.basisAmount !== undefined
    && Number.isFinite(numericRate)
    && numericRate > 0
    ? (commissionPreview.basisAmount * numericRate) / 100
    : null;
  const previewProblem = previewIssue(commissionPreview, commissionPreviewError);
  const scopeReady = commissionScopeType === "project" || Boolean(commissionScopeId);
  const commissionReady = commissionBasisType === "fixed"
    ? Number(commissionFlatAmount) > 0
    : Boolean(commissionPreview?.available && commissionPreview.basisAmount !== null && numericRate > 0 && numericRate <= 100);

  async function runAction(action: () => Promise<unknown>, successMessage: string) {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await action();
      setMessage(successMessage);
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Project participant/commission action failed.");
    } finally {
      setSaving(false);
    }
  }

  async function addParticipant() {
    const candidate = candidates.find((item) => item.value === participantCandidate);
    if (!candidate) {
      setError("Select a participant.");
      return;
    }
    await runAction(async () => {
      await setCustomerProjectParticipant({
        projectId,
        roleKey: participantRoleKey,
        subjectType: candidate.subjectType,
        subjectId: candidate.subjectId,
        notes: participantNotes || null,
      });
      setParticipantCandidate("");
      setParticipantNotes("");
    }, "Project participant added.");
  }

  async function createCommission() {
    await runAction(async () => {
      await createCustomerProjectCommissionObligation({
        projectId,
        participantId: commissionParticipantId,
        basisType: commissionBasisType,
        currencyCode: commissionCurrency,
        scopeType: commissionScopeType,
        flatAmount: commissionBasisType === "fixed" ? Number(commissionFlatAmount) : null,
        rate: commissionBasisType !== "fixed" ? Number(commissionRate) : null,
        productCategoryId: commissionScopeType === "category" ? commissionScopeId || null : null,
        productId: commissionScopeType === "product" ? commissionScopeId || null : null,
        description: commissionDescription || null,
      });
      setCommissionFlatAmount("");
      setCommissionRate("");
      setCommissionDescription("");
      setCommissionScopeId("");
    }, "Commission obligation created in Pending status.");
  }

  async function appendCommissionEvent() {
    await runAction(async () => {
      await appendCustomerProjectCommissionEvent({
        obligationId: eventObligationId,
        eventType,
        amountDelta: ["adjustment", "offset"].includes(eventType) ? Number(eventAmount) : null,
        reason: eventReason || null,
        reversesEventId: eventType === "reversal" ? reversalEventId || null : null,
      });
      setEventAmount("");
      setEventReason("");
      setReversalEventId("");
      await loadEvents();
    }, `Commission ${statusLabel(eventType)} event appended.`);
  }

  if (loading && !canViewParticipants && !canViewCommissions) {
    return (
      <ComponentCard title="Participants & Commission" desc="Loading Project participant and commission boundaries.">
        <p role="status" className="text-sm">Loading Participants & Commission…</p>
      </ComponentCard>
    );
  }

  if (!canViewParticipants && !canViewCommissions) return null;

  return (
    <section className="space-y-6" aria-label="Project Participants and Commission">
      {error ? <div role="alert"><Alert variant="error" title="Participants & Commission action failed" message={error} /></div> : null}
      {message ? <div role="status"><Alert variant="success" title="Participants & Commission updated" message={message} /></div> : null}

      {canViewParticipants ? (
        <ComponentCard
          title="Participants"
          desc="Sales Rep remains canonical in Project Settings. Other Project roles reference existing employee, Customer contact, or Modulex user records."
        >
          <TableViewport>
            <Table variant="admin" minWidth="standard">
              <TableHeader variant="admin">
                <TableRow>
                  <TableCell isHeader variant="admin">Participant</TableCell>
                  <TableCell isHeader variant="admin">Role</TableCell>
                  <TableCell isHeader variant="admin">Source</TableCell>
                  <TableCell isHeader variant="admin">Started</TableCell>
                  <TableCell isHeader variant="admin">Status</TableCell>
                  {canManageParticipants ? <TableCell isHeader variant="admin">Action</TableCell> : null}
                </TableRow>
              </TableHeader>
              <TableBody variant="admin">
                {loading ? <TableStateRow colSpan={canManageParticipants ? 6 : 5}>Refreshing participants…</TableStateRow> : null}
                {!loading && participants.length === 0 ? <TableStateRow colSpan={canManageParticipants ? 6 : 5}>No Project participants have been recorded.</TableStateRow> : null}
                {!loading ? participants.map((participant) => (
                  <TableRow key={participant.id}>
                    <TableCell variant="admin"><span className="font-medium">{participant.displayName}</span></TableCell>
                    <TableCell variant="admin">{participant.roleLabel}</TableCell>
                    <TableCell variant="admin">{participant.source === "project_sales_rep" ? "Project Sales Rep" : statusLabel(participant.subjectType)}</TableCell>
                    <TableCell variant="admin">{displayDate(participant.startedAt)}</TableCell>
                    <TableCell variant="admin"><Badge color={participant.isActive ? "success" : "light"}>{participant.isActive ? "Active" : "Ended"}</Badge></TableCell>
                    {canManageParticipants ? (
                      <TableCell variant="admin">
                        {participant.isActive && participant.source === "manual" ? (
                          <Button variant="outline" size="sm" disabled={saving} onClick={() => void runAction(
                            () => deactivateCustomerProjectParticipant(participant.id),
                            `${participant.displayName} removed from active Project participants.`,
                          )}>
                            End participation
                          </Button>
                        ) : participant.source === "project_sales_rep" ? "Manage in Project Settings" : "—"}
                      </TableCell>
                    ) : null}
                  </TableRow>
                )) : null}
              </TableBody>
            </Table>
          </TableViewport>

          {canManageParticipants ? (
            <div className={`${ADMIN_SURFACE_CARD} grid gap-4 p-4 lg:grid-cols-3`}>
              <div>
                <Label htmlFor="pb6-participant-role">Role</Label>
                <Select id="pb6-participant-role" options={participantRoleOptions} value={participantRoleKey} onChange={setParticipantRoleKey} placeholder="Select role" />
              </div>
              <div>
                <Label htmlFor="pb6-participant-person">Person</Label>
                <Select id="pb6-participant-person" options={participantCandidateOptions} value={participantCandidate} onChange={setParticipantCandidate} placeholder="Select existing person" allowEmpty />
              </div>
              <div>
                <Label htmlFor="pb6-participant-notes">Notes</Label>
                <Input id="pb6-participant-notes" value={participantNotes} onChange={(event) => setParticipantNotes(event.target.value)} />
              </div>
              <div className="flex justify-end lg:col-span-3">
                <Button disabled={saving || !participantRoleKey || !participantCandidate} onClick={() => void addParticipant()}>{saving ? "Saving…" : "Add Participant"}</Button>
              </div>
            </div>
          ) : null}
        </ComponentCard>
      ) : null}

      {canViewCommissions ? (
        <ComponentCard
          title="Commission Ledger"
          desc="Project owns commission entitlement only. Actual payouts remain canonical Finance transactions attributed to the commission obligation. Earned and Approved states are explicit; Project status does not auto-earn commission."
        >
          <TableViewport>
            <Table variant="admin" minWidth="wide">
              <TableHeader variant="admin">
                <TableRow>
                  <TableCell isHeader variant="admin">Participant</TableCell>
                  <TableCell isHeader variant="admin">Scope</TableCell>
                  <TableCell isHeader variant="admin">Basis</TableCell>
                  <TableCell isHeader variant="admin">Current entitlement</TableCell>
                  <TableCell isHeader variant="admin">Status</TableCell>
                  <TableCell isHeader variant="admin">Finance payout</TableCell>
                  <TableCell isHeader variant="admin">Created</TableCell>
                </TableRow>
              </TableHeader>
              <TableBody variant="admin">
                {loading ? <TableStateRow colSpan={7}>Refreshing commission obligations…</TableStateRow> : null}
                {!loading && commissions.length === 0 ? <TableStateRow colSpan={7}>No commission obligations have been created.</TableStateRow> : null}
                {!loading ? commissions.map((commission) => (
                  <TableRow key={commission.obligationId}>
                    <TableCell variant="admin">
                      <div className="space-y-1">
                        <p className="font-medium">{commission.participantName}</p>
                        <p className={`text-xs ${ADMIN_TEXT_STYLES.muted}`}>{commission.roleLabel}</p>
                      </div>
                    </TableCell>
                    <TableCell variant="admin">{statusLabel(commission.scopeType)}</TableCell>
                    <TableCell variant="admin">{basisLabel(commission)}</TableCell>
                    <TableCell variant="admin"><span className="font-medium">{money(commission.currentAmount, commission.currencyCode)}</span></TableCell>
                    <TableCell variant="admin"><Badge color={commissionBadge(commission.status)}>{statusLabel(commission.status)}</Badge></TableCell>
                    <TableCell variant="admin">{payoutLabel(commission)}</TableCell>
                    <TableCell variant="admin">{displayDate(commission.createdAt)}</TableCell>
                  </TableRow>
                )) : null}
              </TableBody>
            </Table>
          </TableViewport>

          {canManageCommissions ? (
            <div className={`${ADMIN_SURFACE_CARD} space-y-5 p-5`}>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div>
                  <Label htmlFor="pb6-commission-participant">Participant</Label>
                  <Select id="pb6-commission-participant" options={commissionParticipantOptions} value={commissionParticipantId} onChange={setCommissionParticipantId} placeholder="Select participant" />
                </div>
                <div>
                  <Label htmlFor="pb6-commission-basis">Commission method</Label>
                  <Select
                    id="pb6-commission-basis"
                    options={[
                      { value: "fixed", label: "Fixed amount" },
                      { value: "percentage", label: "Sales %" },
                      { value: "gross_profit_percentage", label: "Gross profit %" },
                    ]}
                    value={commissionBasisType}
                    onChange={(value) => setCommissionBasisType(value as ProjectCommissionBasisType)}
                  />
                </div>
                <div>
                  <Label htmlFor="pb6-commission-scope">Scope</Label>
                  <Select
                    id="pb6-commission-scope"
                    options={[
                      { value: "project", label: "Whole Project" },
                      { value: "category", label: "Project product category" },
                      { value: "product", label: "Project product" },
                    ]}
                    value={commissionScopeType}
                    onChange={(value) => { setCommissionScopeType(value as ProjectCommissionScopeType); setCommissionScopeId(""); }}
                  />
                </div>
                {commissionScopeType !== "project" ? (
                  <div>
                    <Label htmlFor="pb6-commission-scope-id">{commissionScopeType === "category" ? "Category" : "Product"}</Label>
                    <Select id="pb6-commission-scope-id" options={scopeSelectOptions} value={commissionScopeId} onChange={setCommissionScopeId} placeholder={scopeSelectOptions.length > 0 ? "Select Project scope" : "No matching Project scope"} allowEmpty />
                  </div>
                ) : null}
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {commissionBasisType === "fixed" ? (
                  <div>
                    <Label htmlFor="pb6-commission-flat">Fixed amount</Label>
                    <Input id="pb6-commission-flat" type="number" min="0" step="0.01" value={commissionFlatAmount} onChange={(event) => setCommissionFlatAmount(event.target.value)} />
                  </div>
                ) : (
                  <div>
                    <Label htmlFor="pb6-commission-rate">Rate %</Label>
                    <Input id="pb6-commission-rate" type="number" min="0" max="100" step="0.01" value={commissionRate} onChange={(event) => setCommissionRate(event.target.value)} />
                  </div>
                )}
                <div>
                  <Label htmlFor="pb6-commission-currency">Currency</Label>
                  <Input id="pb6-commission-currency" maxLength={3} value={commissionCurrency} onChange={(event) => setCommissionCurrency(event.target.value.toUpperCase())} />
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="pb6-commission-description">Description</Label>
                  <Input id="pb6-commission-description" value={commissionDescription} onChange={(event) => setCommissionDescription(event.target.value)} />
                </div>
              </div>

              {commissionBasisType !== "fixed" ? (
                <div className={`${ADMIN_SURFACE_CARD} space-y-4 p-4`}>
                  <div>
                    <p className="font-medium">Commission Preview</p>
                    <p className={`text-xs ${ADMIN_TEXT_STYLES.muted}`}>Calculated from canonical Project Order and product-cost data. The DB recalculates the snapshot again when the obligation is created.</p>
                  </div>

                  {loadingCommissionPreview ? <p role="status" className={`text-sm ${ADMIN_TEXT_STYLES.muted}`}>Calculating commission preview…</p> : null}

                  {!loadingCommissionPreview && previewProblem ? (
                    <div role="status" className="space-y-1">
                      <p className="font-medium">{previewProblem.title}</p>
                      <p className={`text-sm ${ADMIN_TEXT_STYLES.muted}`}>{previewProblem.detail}</p>
                    </div>
                  ) : null}

                  {!loadingCommissionPreview && commissionPreview?.available && commissionBasisType === "percentage" ? (
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div><p className={`text-xs ${ADMIN_TEXT_STYLES.muted}`}>Sales basis</p><p className="font-medium">{money(commissionPreview.revenueAmount, commissionPreview.currencyCode)}</p></div>
                      <div><p className={`text-xs ${ADMIN_TEXT_STYLES.muted}`}>Rate</p><p className="font-medium">{numericRate > 0 ? `${numericRate}%` : "—"}</p></div>
                      <div><p className={`text-xs ${ADMIN_TEXT_STYLES.muted}`}>Estimated commission</p><p className="font-medium">{estimatedCommission !== null ? money(estimatedCommission, commissionPreview.currencyCode) : "—"}</p></div>
                    </div>
                  ) : null}

                  {!loadingCommissionPreview && commissionPreview?.available && commissionBasisType === "gross_profit_percentage" ? (
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                      <div><p className={`text-xs ${ADMIN_TEXT_STYLES.muted}`}>Scoped sales</p><p className="font-medium">{money(commissionPreview.revenueAmount, commissionPreview.currencyCode)}</p></div>
                      <div><p className={`text-xs ${ADMIN_TEXT_STYLES.muted}`}>Product cost</p><p className="font-medium">{commissionPreview.costAmount !== null ? money(commissionPreview.costAmount, commissionPreview.currencyCode) : "—"}</p></div>
                      <div><p className={`text-xs ${ADMIN_TEXT_STYLES.muted}`}>Gross profit</p><p className="font-medium">{commissionPreview.basisAmount !== null ? money(commissionPreview.basisAmount, commissionPreview.currencyCode) : "—"}</p></div>
                      <div><p className={`text-xs ${ADMIN_TEXT_STYLES.muted}`}>Rate</p><p className="font-medium">{numericRate > 0 ? `${numericRate}%` : "—"}</p></div>
                      <div><p className={`text-xs ${ADMIN_TEXT_STYLES.muted}`}>Estimated commission</p><p className="font-medium">{estimatedCommission !== null ? money(estimatedCommission, commissionPreview.currencyCode) : "—"}</p></div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="flex justify-end">
                <Button disabled={saving || !commissionParticipantId || !scopeReady || !commissionReady} onClick={() => void createCommission()}>
                  {saving ? "Saving…" : "Create Pending Commission"}
                </Button>
              </div>
            </div>
          ) : null}

          {commissions.length > 0 ? (
            <div className="space-y-4">
              <div>
                <Label htmlFor="pb6-event-obligation">Commission event history</Label>
                <Select
                  id="pb6-event-obligation"
                  options={commissionOptions}
                  value={eventObligationId}
                  onChange={setEventObligationId}
                  placeholder="Select commission"
                />
              </div>

              <TableViewport>
                <Table variant="admin" minWidth="standard">
                  <TableHeader variant="admin">
                    <TableRow>
                      <TableCell isHeader variant="admin">Event</TableCell>
                      <TableCell isHeader variant="admin">Status after</TableCell>
                      <TableCell isHeader variant="admin">Amount delta</TableCell>
                      <TableCell isHeader variant="admin">Reason</TableCell>
                      <TableCell isHeader variant="admin">Created</TableCell>
                    </TableRow>
                  </TableHeader>
                  <TableBody variant="admin">
                    {loadingEvents ? <TableStateRow colSpan={5}>Refreshing commission events…</TableStateRow> : null}
                    {!loadingEvents && commissionEvents.length === 0 ? <TableStateRow colSpan={5}>No lifecycle events have been appended yet.</TableStateRow> : null}
                    {!loadingEvents ? commissionEvents.map((event) => (
                      <TableRow key={event.eventId}>
                        <TableCell variant="admin">
                          <div className="space-y-1">
                            <p className="font-medium">{statusLabel(event.eventType)}</p>
                            {event.isReversed ? <Badge color="light">Reversed</Badge> : null}
                          </div>
                        </TableCell>
                        <TableCell variant="admin">{statusLabel(event.statusAfter)}</TableCell>
                        <TableCell variant="admin">{event.amountDelta === 0 ? "—" : `${event.amountDelta > 0 ? "+" : ""}${money(event.amountDelta, selectedCommission?.currencyCode ?? "USD")}`}</TableCell>
                        <TableCell variant="admin">{event.reason || "—"}</TableCell>
                        <TableCell variant="admin">{displayDateTime(event.createdAt)}</TableCell>
                      </TableRow>
                    )) : null}
                  </TableBody>
                </Table>
              </TableViewport>
            </div>
          ) : null}

          {canManageCommissions && commissions.length > 0 ? (
            <div className={`${ADMIN_SURFACE_CARD} grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-4`}>
              <div>
                <Label htmlFor="pb6-event-type">Append event</Label>
                <Select
                  id="pb6-event-type"
                  options={[
                    { value: "earned", label: "Mark Earned" },
                    { value: "approved", label: "Approve" },
                    { value: "cancelled", label: "Cancel" },
                    { value: "adjustment", label: "Adjustment" },
                    { value: "offset", label: "Offset / deduction" },
                    { value: "reversal", label: "Reverse adjustment/offset" },
                  ]}
                  value={eventType}
                  onChange={(value) => { setEventType(value as ProjectCommissionEventType); setReversalEventId(""); }}
                />
              </div>
              {["adjustment", "offset"].includes(eventType) ? (
                <div>
                  <Label htmlFor="pb6-event-amount">Amount delta</Label>
                  <Input id="pb6-event-amount" type="number" step="0.01" value={eventAmount} onChange={(event) => setEventAmount(event.target.value)} />
                </div>
              ) : null}
              {eventType === "reversal" ? (
                <div>
                  <Label htmlFor="pb6-reversal-event">Adjustment / offset to reverse</Label>
                  <Select id="pb6-reversal-event" options={reversalOptions} value={reversalEventId} onChange={setReversalEventId} placeholder={reversalOptions.length > 0 ? "Select event" : "No reversible event"} allowEmpty />
                </div>
              ) : null}
              {["cancelled", "adjustment", "offset", "reversal"].includes(eventType) ? (
                <div>
                  <Label htmlFor="pb6-event-reason">Reason</Label>
                  <Input id="pb6-event-reason" value={eventReason} onChange={(event) => setEventReason(event.target.value)} />
                </div>
              ) : null}
              <div className="flex items-center justify-between gap-3 md:col-span-2 xl:col-span-4">
                <p className={`text-xs ${ADMIN_TEXT_STYLES.muted}`}>Corrections append new events; approved history is never edited in place.</p>
                <Button disabled={saving || !eventObligationId || (eventType === "reversal" && !reversalEventId)} onClick={() => void appendCommissionEvent()}>{saving ? "Saving…" : "Append Commission Event"}</Button>
              </div>
            </div>
          ) : null}
        </ComponentCard>
      ) : null}
    </section>
  );
}
