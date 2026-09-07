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

export default function ProjectProposalRevisionHistory({ revisions }: { revisions: ProjectProposalRevision[] }) {
  return (
    <ComponentCard title="Revision History" desc="Commercial history is read-only in P2. Send, reject, acceptance, and new-revision lifecycle actions are delivered in P3.">
      <TableViewport>
        <Table variant="admin" minWidth="standard">
          <TableHeader variant="admin">
            <TableRow>
              <TableCell isHeader variant="admin">Revision</TableCell>
              <TableCell isHeader variant="admin">State</TableCell>
              <TableCell isHeader variant="admin">Total</TableCell>
              <TableCell isHeader variant="admin">Note</TableCell>
            </TableRow>
          </TableHeader>
          <TableBody variant="admin">
            {revisions.length === 0 ? <TableStateRow colSpan={4}>No Proposal revisions yet.</TableStateRow> : null}
            {revisions.map((revision) => (
              <TableRow key={revision.id}>
                <TableCell variant="admin"><span className="font-medium">Revision {revision.revisionNo}</span></TableCell>
                <TableCell variant="admin"><Badge color={tone(revision.state)}>{revision.state.replaceAll("_", " ")}</Badge></TableCell>
                <TableCell variant="admin">{money(revision.proposalTotal, revision.currencyCode)}</TableCell>
                <TableCell variant="admin">{revision.revisionNote || revision.rejectionNote || "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableViewport>
    </ComponentCard>
  );
}
