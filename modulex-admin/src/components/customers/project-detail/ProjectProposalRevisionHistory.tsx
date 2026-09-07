"use client";

import ComponentCard from "@/components/common/ComponentCard";
import Badge from "@/components/ui/badge/Badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
  TableStateRow,
  TableViewport,
} from "@/components/ui/table";
import type { ProjectProposalRevision } from "@/lib/customers/project-proposal-domain";

type BadgeColor = "primary" | "success" | "warning" | "error" | "info" | "light";

function tone(state: ProjectProposalRevision["state"]): BadgeColor {
  if (state === "accepted") return "success";
  if (state === "rejected") return "error";
  if (state === "sent") return "info";
  if (state === "superseded") return "light";
  return "warning";
}

function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

function lifecycleEvidence(revision: ProjectProposalRevision) {
  if (revision.state === "accepted") {
    return {
      label: "Accepted",
      timestamp: revision.acceptedAt,
      detail: revision.acceptance
        ? `${revision.acceptance.acceptedName} · ${revision.acceptance.acceptanceMethod}`
        : null,
    };
  }
  if (revision.state === "rejected") {
    return { label: "Rejected", timestamp: revision.rejectedAt, detail: revision.rejectionNote };
  }
  if (revision.state === "sent") {
    return { label: "Sent", timestamp: revision.sentAt, detail: null };
  }
  if (revision.state === "superseded") {
    return { label: "Superseded", timestamp: revision.supersededAt, detail: null };
  }
  return { label: "Draft", timestamp: null, detail: null };
}

export default function ProjectProposalRevisionHistory({ revisions }: { revisions: ProjectProposalRevision[] }) {
  return (
    <ComponentCard title="Revision History" desc="Read-only lifecycle evidence for each exact Proposal revision.">
      <TableViewport>
        <Table variant="admin" minWidth="standard">
          <TableHeader variant="admin">
            <TableRow>
              <TableCell isHeader variant="admin">Revision</TableCell>
              <TableCell isHeader variant="admin">State</TableCell>
              <TableCell isHeader variant="admin">Total</TableCell>
              <TableCell isHeader variant="admin">Lifecycle Evidence</TableCell>
              <TableCell isHeader variant="admin">Revision Note</TableCell>
            </TableRow>
          </TableHeader>
          <TableBody variant="admin">
            {revisions.length === 0 ? <TableStateRow colSpan={5}>No Proposal revisions yet.</TableStateRow> : null}
            {revisions.map((revision) => {
              const evidence = lifecycleEvidence(revision);
              return (
                <TableRow key={revision.id}>
                  <TableCell variant="admin"><span className="font-medium">Revision {revision.revisionNo}</span></TableCell>
                  <TableCell variant="admin"><Badge color={tone(revision.state)}>{revision.state.replaceAll("_", " ")}</Badge></TableCell>
                  <TableCell variant="admin">{money(revision.proposalTotal, revision.currencyCode)}</TableCell>
                  <TableCell variant="admin">
                    <span className="font-medium">{evidence.label}</span>
                    {evidence.timestamp ? <p className="text-sm">{evidence.timestamp}</p> : null}
                    {evidence.detail ? <p className="text-sm">{evidence.detail}</p> : null}
                  </TableCell>
                  <TableCell variant="admin">{revision.revisionNote || "—"}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableViewport>
    </ComponentCard>
  );
}
