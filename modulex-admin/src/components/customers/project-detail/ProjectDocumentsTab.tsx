"use client";

import { useCallback, useEffect, useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import EntityDocumentsPanel from "@/components/customers/EntityDocumentsPanel";
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
import {
  downloadProjectProposalArtifact,
  getProjectProposalArtifacts,
  type ProjectProposalArtifact,
} from "@/lib/customers/project-proposal-artifact-client";
import { formatDateTime } from "@/lib/dates/usDate";

export default function ProjectDocumentsTab({ projectId }: { projectId: string }) {
  const [artifacts, setArtifacts] = useState<ProjectProposalArtifact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setArtifacts(await getProjectProposalArtifacts(projectId));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Project system documents could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function downloadArtifact(artifact: ProjectProposalArtifact) {
    if (downloadingId) return;
    setDownloadingId(artifact.id);
    setError(null);
    try {
      const blob = await downloadProjectProposalArtifact({ projectId, artifactId: artifact.id });
      const url = URL.createObjectURL(blob);
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download = artifact.fileName;
      anchor.rel = "noopener";
      window.document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "Project system document could not be downloaded.");
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <EntityDocumentsPanel
        entityType="project"
        entityId={projectId}
        includeLinkedOrders
        title="Uploaded Documents"
      />

      <ComponentCard
        title="System Documents"
        desc="Immutable Project document snapshots. Accepted Proposal PDFs are stored once and downloaded from private storage without re-rendering."
      >
        <div className="space-y-4">
          {error ? (
            <Alert
              variant="error"
              title="Project system documents unavailable"
              message={error}
            />
          ) : null}

          {error ? (
            <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              Retry
            </Button>
          ) : null}

          <TableViewport>
            <Table variant="admin" minWidth="standard">
              <TableHeader variant="admin">
                <TableRow>
                  <TableCell isHeader variant="admin">Document</TableCell>
                  <TableCell isHeader variant="admin">Proposal</TableCell>
                  <TableCell isHeader variant="admin">Accepted</TableCell>
                  <TableCell isHeader variant="admin">Visibility</TableCell>
                  <TableCell isHeader variant="admin">Action</TableCell>
                </TableRow>
              </TableHeader>
              <TableBody variant="admin">
                {loading ? <TableStateRow colSpan={5}>Loading Project system documents…</TableStateRow> : null}
                {!loading && !error && artifacts.length === 0 ? (
                  <TableStateRow colSpan={5}>No accepted Proposal documents yet.</TableStateRow>
                ) : null}
                {!loading ? artifacts.map((artifact) => (
                  <TableRow key={artifact.id}>
                    <TableCell variant="admin">
                      <p className="font-medium">{artifact.fileName}</p>
                      <p className="text-sm">Accepted Proposal PDF</p>
                    </TableCell>
                    <TableCell variant="admin">
                      <p className="font-medium">{artifact.proposalNumber}</p>
                      <p className="text-sm">Revision {artifact.revisionNo}</p>
                    </TableCell>
                    <TableCell variant="admin">
                      <p>{artifact.acceptedName || "—"}</p>
                      <p className="text-sm">{artifact.acceptedAt ? formatDateTime(artifact.acceptedAt) : "—"}</p>
                    </TableCell>
                    <TableCell variant="admin">
                      <Badge color={artifact.portalVisible ? "info" : "light"}>
                        {artifact.portalVisible ? "Portal" : "Internal"}
                      </Badge>
                    </TableCell>
                    <TableCell variant="admin">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void downloadArtifact(artifact)}
                        disabled={Boolean(downloadingId)}
                      >
                        {downloadingId === artifact.id ? "Downloading…" : "Download PDF"}
                      </Button>
                    </TableCell>
                  </TableRow>
                )) : null}
              </TableBody>
            </Table>
          </TableViewport>
        </div>
      </ComponentCard>
    </div>
  );
}
