"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import Select from "@/components/form/Select";
import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { getCurrentProfile } from "@/lib/supabase/profile";
import {
  createProjectProposal,
  getProjectProposal,
  getProjectProposals,
  getProposalAreaTypes,
  mapProjectProposalError,
  type ProposalAreaType,
  type ProjectProposal,
  type ProjectProposalSummary,
} from "@/lib/customers/project-proposal-domain";
import ProjectProposalAreaList from "./ProjectProposalAreaList";
import ProjectProposalEditor from "./ProjectProposalEditor";
import ProjectProposalLifecycleActions from "./ProjectProposalLifecycleActions";
import ProjectProposalPricingGroups from "./ProjectProposalPricingGroups";
import ProjectProposalRevisionHistory from "./ProjectProposalRevisionHistory";

type BadgeColor = "primary" | "success" | "warning" | "error" | "info" | "light";

function statusTone(status: ProjectProposalSummary["status"]): BadgeColor {
  if (status === "accepted") return "success";
  if (status === "rejected") return "error";
  if (status === "sent") return "info";
  if (status === "superseded") return "light";
  return "warning";
}

function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

export default function ProjectProposalTab({ projectId }: { projectId: string }) {
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summaries, setSummaries] = useState<ProjectProposalSummary[]>([]);
  const [areaTypes, setAreaTypes] = useState<ProposalAreaType[]>([]);
  const [selectedProposalId, setSelectedProposalId] = useState("");
  const [proposal, setProposal] = useState<ProjectProposal | null>(null);
  const createKeyRef = useRef<string | null>(null);

  const loadDetail = useCallback(async (proposalId: string) => {
    if (!proposalId) {
      setProposal(null);
      return;
    }
    setDetailLoading(true);
    setError(null);
    try {
      setProposal(await getProjectProposal(proposalId));
    } catch (loadError) {
      setError(mapProjectProposalError(loadError));
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const load = useCallback(async (preferredProposalId?: string) => {
    setLoading(true);
    setError(null);
    try {
      const { profile, error: profileError } = await getCurrentProfile();
      if (profileError) throw profileError;
      const roles = profile?.roles ?? [];
      const canView = roles.some((role) => ["super_admin", "admin", "sales", "finance"].includes(role));
      const nextCanManage = roles.some((role) => ["super_admin", "admin", "sales"].includes(role));
      setCanManage(nextCanManage);
      setPermissionDenied(!canView);
      if (!canView) {
        setSummaries([]);
        setAreaTypes([]);
        setProposal(null);
        return;
      }

      const [nextSummaries, nextAreaTypes] = await Promise.all([
        getProjectProposals(projectId),
        getProposalAreaTypes(true),
      ]);
      setSummaries(nextSummaries);
      setAreaTypes(nextAreaTypes);
      const chosenId = preferredProposalId && nextSummaries.some((item) => item.id === preferredProposalId)
        ? preferredProposalId
        : selectedProposalId && nextSummaries.some((item) => item.id === selectedProposalId)
          ? selectedProposalId
          : nextSummaries[0]?.id ?? "";
      setSelectedProposalId(chosenId);
      if (chosenId) {
        setProposal(await getProjectProposal(chosenId));
      } else {
        setProposal(null);
      }
    } catch (loadError) {
      const message = mapProjectProposalError(loadError);
      if (/permission|forbidden/i.test(message)) setPermissionDenied(true);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [projectId, selectedProposalId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createProposal() {
    if (!canManage || creating) return;
    if (!createKeyRef.current) createKeyRef.current = crypto.randomUUID();
    setCreating(true);
    setError(null);
    try {
      const proposalId = await createProjectProposal({ projectId, idempotencyKey: createKeyRef.current });
      createKeyRef.current = null;
      await load(proposalId);
    } catch (createError) {
      setError(mapProjectProposalError(createError));
    } finally {
      setCreating(false);
    }
  }

  async function refreshSelected() {
    if (!selectedProposalId) return;
    await loadDetail(selectedProposalId);
    const nextSummaries = await getProjectProposals(projectId);
    setSummaries(nextSummaries);
  }

  const proposalOptions = useMemo(() => summaries.map((item) => ({
    value: item.id,
    label: `${item.proposalNumber} — ${item.status.replaceAll("_", " ")}`,
  })), [summaries]);

  const selectedRevision = proposal
    ? proposal.revisions.find((revision) => revision.id === proposal.currentRevisionId) ?? proposal.revisions[0] ?? null
    : null;
  const proposal_total = selectedRevision?.proposalTotal ?? 0;
  const editable = Boolean(canManage && selectedRevision?.state === "draft");

  if (loading && summaries.length === 0 && !proposal) {
    return (
      <ComponentCard title="Proposal" desc="Loading Proposal commercial scope and pricing.">
        <p className="text-sm" role="status">Loading Proposal…</p>
      </ComponentCard>
    );
  }

  if (permissionDenied) {
    return (
      <Alert
        variant="warning"
        title="Proposal access restricted"
        message="You do not have permission to view Project Proposals. Proposal read access is limited to Sales, Finance, Admin, and Super Admin roles."
      />
    );
  }

  if (summaries.length === 0) {
    return (
      <div className="space-y-3">
        {error ? <Alert variant="error" title="Proposal could not be loaded" message={error} /> : null}
        <ComponentCard title="Proposal" desc="No commercial Proposal exists for this Project yet.">
          {canManage ? (
            <Button onClick={() => void createProposal()} disabled={creating}>{creating ? "Creating…" : "Create Proposal"}</Button>
          ) : <p className="text-sm">You have read access, but you do not have permission to create or edit Proposals.</p>}
        </ComponentCard>
        {error ? <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>Retry</Button> : null}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error ? <div role="alert"><Alert variant="error" title="Proposal action failed" message={error} /></div> : null}
      <ComponentCard
        title={proposal?.proposalNumber || "Proposal"}
        desc="Proposal commercial lifecycle is independent from the Project lifecycle. Totals are derived by the authoritative DB read model."
        headerAction={proposal ? <Badge color={statusTone(proposal.status)}>{proposal.status.replaceAll("_", " ")}</Badge> : undefined}
      >
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-end">
          <Select
            options={proposalOptions}
            value={selectedProposalId}
            onChange={(value) => {
              setSelectedProposalId(value);
              void loadDetail(value);
            }}
            ariaLabel="Select Project Proposal"
          />
          <div className="text-sm">
            <p className="font-medium">Proposal Total</p>
            <p>{selectedRevision ? money(proposal_total, selectedRevision.currencyCode) : "—"}</p>
          </div>
          {canManage ? <Button size="sm" variant="outline" onClick={() => void createProposal()} disabled={creating}>{creating ? "Creating…" : "New Proposal"}</Button> : null}
        </div>
        {detailLoading ? <p className="text-sm" role="status">Loading Proposal revision…</p> : null}
      </ComponentCard>

      {proposal && selectedRevision ? (
        <>
          <ProjectProposalLifecycleActions proposal={proposal} canManage={canManage} onChanged={refreshSelected} />
          {!editable && canManage ? (
            <Alert variant="info" title="Revision locked" message="This revision cannot be edited in place. Use the Proposal Lifecycle actions for sent revisions; accepted commercial changes belong in Project Change Orders." />
          ) : null}
          <ProjectProposalEditor revision={selectedRevision} canManage={editable} onSaved={refreshSelected} />
          <ProjectProposalPricingGroups
            revisionId={selectedRevision.id}
            currencyCode={selectedRevision.currencyCode}
            groups={selectedRevision.pricingGroups}
            areas={selectedRevision.areas}
            canManage={editable}
            onChanged={refreshSelected}
          />
          <ProjectProposalAreaList
            revisionId={selectedRevision.id}
            currencyCode={selectedRevision.currencyCode}
            areas={selectedRevision.areas}
            areaTypes={areaTypes}
            pricingGroups={selectedRevision.pricingGroups}
            canManage={editable}
            onChanged={refreshSelected}
          />
          <ProjectProposalRevisionHistory revisions={proposal.revisions} />
        </>
      ) : (
        <ComponentCard title="Proposal Revision" desc="The selected Proposal has no readable Revision.">
          <Button variant="outline" size="sm" onClick={() => void load(selectedProposalId)} disabled={loading}>Retry</Button>
        </ComponentCard>
      )}
    </div>
  );
}
