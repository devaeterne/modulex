"use client";

import { useMemo, useRef, useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import TextArea from "@/components/form/input/TextArea";
import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { Modal } from "@/components/ui/modal";
import { ensureAcceptedProjectProposalArtifact } from "@/lib/customers/project-proposal-artifact-client";
import {
  acceptProjectProposalRevision,
  createProjectProposalRevision,
  rejectProjectProposalRevision,
  sendProjectProposalRevision,
} from "@/lib/customers/project-proposal-lifecycle-domain";
import {
  mapProjectProposalError,
  type ProjectProposal,
  type ProjectProposalRevision,
} from "@/lib/customers/project-proposal-domain";

type DialogKind = "send" | "new_revision" | "reject" | "accept" | null;

export default function ProjectProposalLifecycleActions({
  proposal,
  canManage,
  onChanged,
}: {
  proposal: ProjectProposal;
  canManage: boolean;
  onChanged: () => Promise<void> | void;
}) {
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [activeRevision, setActiveRevision] = useState<ProjectProposalRevision | null>(null);
  const [revisionNote, setRevisionNote] = useState("");
  const [rejectionNote, setRejectionNote] = useState("");
  const [acceptedName, setAcceptedName] = useState("");
  const [acceptedEmail, setAcceptedEmail] = useState("");
  const [acceptanceMethod, setAcceptanceMethod] = useState("manual");
  const [signatureText, setSignatureText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snapshotBusyRevisionId, setSnapshotBusyRevisionId] = useState<string | null>(null);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [snapshotSuccess, setSnapshotSuccess] = useState<string | null>(null);
  const newRevisionKeyRef = useRef<string | null>(null);

  const draftRevision = useMemo(
    () => proposal.revisions.find((revision) => revision.state === "draft") ?? null,
    [proposal.revisions],
  );
  const sentRevisions = useMemo(
    () => proposal.revisions
      .filter((revision) => revision.state === "sent")
      .sort((a, b) => b.revisionNo - a.revisionNo),
    [proposal.revisions],
  );
  const acceptedRevision = useMemo(
    () => proposal.revisions.find((revision) => revision.state === "accepted") ?? null,
    [proposal.revisions],
  );
  const hasDraftRevision = Boolean(draftRevision);

  function openDialog(kind: Exclude<DialogKind, null>, revision: ProjectProposalRevision) {
    setDialog(kind);
    setActiveRevision(revision);
    setRevisionNote("");
    setRejectionNote("");
    setAcceptedName("");
    setAcceptedEmail("");
    setAcceptanceMethod("manual");
    setSignatureText("");
    setError(null);
    if (kind !== "new_revision") newRevisionKeyRef.current = null;
  }

  function closeDialog() {
    if (busy) return;
    setDialog(null);
    setActiveRevision(null);
    setError(null);
    newRevisionKeyRef.current = null;
  }

  async function persistAcceptedSnapshot(revisionId: string) {
    if (snapshotBusyRevisionId) return false;
    setSnapshotBusyRevisionId(revisionId);
    setSnapshotError(null);
    setSnapshotSuccess(null);
    try {
      await ensureAcceptedProjectProposalArtifact({
        projectId: proposal.projectId,
        proposalId: proposal.id,
        revisionId,
      });
      setSnapshotSuccess("Immutable accepted Proposal PDF snapshot is available in Project Documents.");
      return true;
    } catch (snapshotPersistError) {
      const detail = snapshotPersistError instanceof Error
        ? snapshotPersistError.message
        : "Accepted Proposal PDF snapshot could not be persisted.";
      setSnapshotError(`Acceptance remains recorded. ${detail}`);
      return false;
    } finally {
      setSnapshotBusyRevisionId(null);
    }
  }

  async function submitLifecycleAction() {
    if (!activeRevision || !dialog || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (dialog === "send") {
        await sendProjectProposalRevision(activeRevision.id);
      } else if (dialog === "new_revision") {
        if (!newRevisionKeyRef.current) newRevisionKeyRef.current = crypto.randomUUID();
        await createProjectProposalRevision({
          proposalId: proposal.id,
          idempotencyKey: newRevisionKeyRef.current,
          revisionNote,
        });
      } else if (dialog === "reject") {
        await rejectProjectProposalRevision({
          revisionId: activeRevision.id,
          rejectionNote,
        });
      } else if (dialog === "accept") {
        await acceptProjectProposalRevision({
          revisionId: activeRevision.id,
          acceptedName,
          acceptedEmail,
          acceptanceMethod,
          signatureText,
        });
        await persistAcceptedSnapshot(activeRevision.id);
      }
      setDialog(null);
      setActiveRevision(null);
      newRevisionKeyRef.current = null;
      await onChanged();
    } catch (actionError) {
      setError(mapProjectProposalError(actionError));
    } finally {
      setBusy(false);
    }
  }

  const dialogTitle = dialog === "send"
    ? "Send Proposal"
    : dialog === "new_revision"
      ? "New Revision"
      : dialog === "reject"
        ? "Reject Proposal"
        : dialog === "accept"
          ? "Accept Proposal"
          : "Proposal lifecycle action";

  return (
    <>
      <ComponentCard
        title="Proposal Lifecycle"
        desc="Lifecycle actions apply to exact Proposal revisions. Project status and Order creation remain separate workflows."
      >
        <div className="space-y-4">
          {acceptedRevision ? (
            <Alert
              variant="info"
              title={`Revision ${acceptedRevision.revisionNo} accepted`}
              message="The accepted commercial baseline is immutable. Use the Project Change Orders tab for later commercial scope or price changes."
            />
          ) : null}

          {snapshotError ? (
            <Alert
              variant="warning"
              title="Accepted snapshot needs retry"
              message={snapshotError}
            />
          ) : null}

          {snapshotSuccess ? (
            <Alert
              variant="success"
              title="Accepted snapshot ready"
              message={snapshotSuccess}
            />
          ) : null}

          {acceptedRevision && canManage ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium">Accepted Proposal document</p>
                <p className="mt-1 text-sm">Ensure the exact accepted Revision PDF exists as the immutable canonical Project document. This action is idempotent.</p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void persistAcceptedSnapshot(acceptedRevision.id)}
                disabled={busy || Boolean(snapshotBusyRevisionId)}
              >
                {snapshotBusyRevisionId === acceptedRevision.id ? "Persisting Snapshot…" : "Ensure Accepted Snapshot"}
              </Button>
            </div>
          ) : null}

          {draftRevision ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium">Revision {draftRevision.revisionNo}</p>
                <div className="mt-1"><Badge color="warning">draft</Badge></div>
                <p className="mt-1 text-sm">Edit the draft as needed, then send it to lock the exact commercial snapshot.</p>
              </div>
              {canManage ? (
                <Button onClick={() => openDialog("send", draftRevision)} disabled={busy}>Send Proposal</Button>
              ) : null}
            </div>
          ) : null}

          {sentRevisions.map((revision) => (
            <div key={revision.id} className="flex flex-wrap items-center justify-between gap-3 border-t pt-4 first:border-t-0 first:pt-0">
              <div>
                <p className="font-medium">Revision {revision.revisionNo}</p>
                <div className="mt-1"><Badge color="info">sent</Badge></div>
                <p className="mt-1 text-sm">Choose the exact sent revision to revise, reject, or accept.</p>
              </div>
              {canManage && revision.state === "sent" ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openDialog("new_revision", revision)}
                    disabled={busy || hasDraftRevision}
                  >
                    New Revision
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => openDialog("reject", revision)}
                    disabled={busy}
                  >
                    Reject Proposal
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => openDialog("accept", revision)}
                    disabled={busy}
                  >
                    Accept Proposal
                  </Button>
                </div>
              ) : null}
            </div>
          ))}

          {!canManage ? (
            <p className="text-sm">You have read access to Proposal lifecycle history, but lifecycle mutations require Sales or Admin permissions.</p>
          ) : null}

          {canManage && !draftRevision && sentRevisions.length === 0 && !acceptedRevision ? (
            <p className="text-sm">No lifecycle action is available for the current Proposal state.</p>
          ) : null}
        </div>
      </ComponentCard>

      <Modal
        isOpen={dialog !== null}
        onClose={closeDialog}
        className="m-4 w-full max-w-xl p-6"
        ariaLabel={dialogTitle}
      >
        <div className="space-y-5">
          <div>
            <h3 className="text-lg font-semibold">{dialogTitle}</h3>
            <p className="text-sm">{activeRevision ? `Revision ${activeRevision.revisionNo}` : "Proposal revision"}</p>
          </div>

          {error ? <Alert variant="error" title="Lifecycle action failed" message={error} /> : null}

          {dialog === "send" ? (
            <Alert
              variant="warning"
              title="This locks the exact revision"
              message="Sending makes this revision immutable. The database also requires at least one Area and rejects empty Pricing Groups."
            />
          ) : null}

          {dialog === "new_revision" ? (
            <div>
              <Label htmlFor="proposal-new-revision-note">Revision Note</Label>
              <TextArea
                id="proposal-new-revision-note"
                value={revisionNote}
                onChange={setRevisionNote}
                rows={4}
                hint="Optional note describing why this new draft revision is being created."
              />
            </div>
          ) : null}

          {dialog === "reject" ? (
            <div>
              <Label htmlFor="proposal-rejection-note">Rejection Note</Label>
              <TextArea
                id="proposal-rejection-note"
                value={rejectionNote}
                onChange={setRejectionNote}
                rows={4}
                hint="Required. Record why this exact sent revision was rejected."
              />
            </div>
          ) : null}

          {dialog === "accept" ? (
            <div className="space-y-4">
              <div>
                <Label htmlFor="proposal-accepted-name">Accepted Name</Label>
                <Input
                  id="proposal-accepted-name"
                  value={acceptedName}
                  onChange={(event) => setAcceptedName(event.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="proposal-accepted-email">Accepted Email</Label>
                <Input
                  id="proposal-accepted-email"
                  type="email"
                  value={acceptedEmail}
                  onChange={(event) => setAcceptedEmail(event.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="proposal-acceptance-method">Acceptance Method</Label>
                <Input
                  id="proposal-acceptance-method"
                  value={acceptanceMethod}
                  onChange={(event) => setAcceptanceMethod(event.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="proposal-signature-text">Signature Text</Label>
                <TextArea
                  id="proposal-signature-text"
                  value={signatureText}
                  onChange={setSignatureText}
                  rows={3}
                  hint="Optional typed signature or acceptance evidence text."
                />
              </div>
              <Alert
                variant="warning"
                title="Acceptance is immutable"
                message="Acceptance attaches to this exact sent revision. After acceptance, Modulex persists the exact Revision PDF as an immutable Project document. Order creation and Project lifecycle remain separate."
              />
            </div>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={closeDialog} disabled={busy}>Cancel</Button>
            <Button
              variant={dialog === "reject" ? "danger" : "primary"}
              onClick={() => void submitLifecycleAction()}
              disabled={
                busy
                || (dialog === "reject" && !rejectionNote.trim())
                || (dialog === "accept" && (!acceptedName.trim() || !acceptanceMethod.trim()))
              }
            >
              {busy ? "Working…" : dialogTitle}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
