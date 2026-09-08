"use client";

import { useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";
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
import type { ProjectProposalRevision } from "@/lib/customers/project-proposal-domain";
import { fetchProjectProposalPdf } from "@/lib/customers/project-proposal-pdf-client";
import { formatDateTime } from "@/lib/dates/usDate";

type BadgeColor = "primary" | "success" | "warning" | "error" | "info" | "light";

type Props = {
  projectId: string;
  proposalId: string;
  proposalNumber: string;
  revisions: ProjectProposalRevision[];
};

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

function safeFilePart(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "Proposal";
}

export default function ProjectProposalRevisionHistory({
  projectId,
  proposalId,
  proposalNumber,
  revisions,
}: Props) {
  const [pdfAction, setPdfAction] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);

  async function previewPdf(revision: ProjectProposalRevision) {
    const actionKey = `${revision.id}:preview`;
    if (pdfAction) return;
    const popup = window.open("about:blank", "_blank");
    if (!popup) {
      setPdfError("PDF preview was blocked by the browser. Allow pop-ups for this Admin site and try again.");
      return;
    }
    popup.opener = null;
    setPdfAction(actionKey);
    setPdfError(null);
    try {
      const blob = await fetchProjectProposalPdf({ projectId, proposalId, revisionId: revision.id });
      const url = URL.createObjectURL(blob);
      popup.location.href = url;
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      popup.close();
      setPdfError(error instanceof Error ? error.message : "Proposal PDF preview could not be generated.");
    } finally {
      setPdfAction(null);
    }
  }

  async function downloadPdf(revision: ProjectProposalRevision) {
    const actionKey = `${revision.id}:download`;
    if (pdfAction) return;
    setPdfAction(actionKey);
    setPdfError(null);
    try {
      const blob = await fetchProjectProposalPdf({
        projectId,
        proposalId,
        revisionId: revision.id,
        download: true,
      });
      const url = URL.createObjectURL(blob);
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download = `Proposal-${safeFilePart(proposalNumber)}-R${revision.revisionNo}.pdf`;
      anchor.rel = "noopener";
      window.document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setPdfError(error instanceof Error ? error.message : "Proposal PDF download could not be generated.");
    } finally {
      setPdfAction(null);
    }
  }

  return (
    <ComponentCard title="Revision History" desc="Read-only lifecycle evidence and exact-revision Proposal PDF output.">
      <div className="space-y-3">
        {pdfError ? <Alert variant="error" title="Proposal PDF could not be generated" message={pdfError} /> : null}
        <TableViewport>
          <Table variant="admin" minWidth="standard">
            <TableHeader variant="admin">
              <TableRow>
                <TableCell isHeader variant="admin">Revision</TableCell>
                <TableCell isHeader variant="admin">State</TableCell>
                <TableCell isHeader variant="admin">Total</TableCell>
                <TableCell isHeader variant="admin">Lifecycle Evidence</TableCell>
                <TableCell isHeader variant="admin">Revision Note</TableCell>
                <TableCell isHeader variant="admin">PDF</TableCell>
              </TableRow>
            </TableHeader>
            <TableBody variant="admin">
              {revisions.length === 0 ? <TableStateRow colSpan={6}>No Proposal revisions yet.</TableStateRow> : null}
              {revisions.map((revision) => {
                const evidence = lifecycleEvidence(revision);
                const previewKey = `${revision.id}:preview`;
                const downloadKey = `${revision.id}:download`;
                const isBusy = Boolean(pdfAction);
                return (
                  <TableRow key={revision.id}>
                    <TableCell variant="admin"><span className="font-medium">Revision {revision.revisionNo}</span></TableCell>
                    <TableCell variant="admin"><Badge color={tone(revision.state)}>{revision.state.replaceAll("_", " ")}</Badge></TableCell>
                    <TableCell variant="admin">{money(revision.proposalTotal, revision.currencyCode)}</TableCell>
                    <TableCell variant="admin">
                      <span className="font-medium">{evidence.label}</span>
                      {evidence.timestamp ? <p className="text-sm">{formatDateTime(evidence.timestamp)}</p> : null}
                      {evidence.detail ? <p className="text-sm">{evidence.detail}</p> : null}
                    </TableCell>
                    <TableCell variant="admin">{revision.revisionNote || "—"}</TableCell>
                    <TableCell variant="admin">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => void previewPdf(revision)}
                          disabled={isBusy}
                        >
                          {pdfAction === previewKey ? "Preparing…" : "Preview PDF"}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => void downloadPdf(revision)}
                          disabled={isBusy}
                        >
                          {pdfAction === downloadKey ? "Preparing…" : "Download PDF"}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableViewport>
      </div>
    </ComponentCard>
  );
}
