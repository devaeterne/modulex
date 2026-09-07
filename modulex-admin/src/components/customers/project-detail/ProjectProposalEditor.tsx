"use client";

import { useEffect, useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import TextArea from "@/components/form/input/TextArea";
import Button from "@/components/ui/button/Button";
import Alert from "@/components/ui/alert/Alert";
import {
  mapProjectProposalError,
  updateProjectProposalDraft,
  type ProjectProposalRevision,
} from "@/lib/customers/project-proposal-domain";

export default function ProjectProposalEditor({
  revision,
  canManage,
  onSaved,
}: {
  revision: ProjectProposalRevision;
  canManage: boolean;
  onSaved: () => Promise<void> | void;
}) {
  const [currencyCode, setCurrencyCode] = useState(revision.currencyCode);
  const [validUntil, setValidUntil] = useState(revision.validUntil ?? "");
  const [customerMessage, setCustomerMessage] = useState(revision.customerMessage ?? "");
  const [termsText, setTermsText] = useState(revision.termsText ?? "");
  const [revisionNote, setRevisionNote] = useState(revision.revisionNote ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editable = canManage && revision.state === "draft";

  useEffect(() => {
    setCurrencyCode(revision.currencyCode);
    setValidUntil(revision.validUntil ?? "");
    setCustomerMessage(revision.customerMessage ?? "");
    setTermsText(revision.termsText ?? "");
    setRevisionNote(revision.revisionNote ?? "");
    setError(null);
  }, [revision]);

  async function save() {
    if (!editable || saving) return;
    setSaving(true);
    setError(null);
    try {
      await updateProjectProposalDraft({
        revisionId: revision.id,
        currencyCode,
        validUntil,
        customerMessage,
        termsText,
        revisionNote,
      });
      await onSaved();
    } catch (saveError) {
      setError(mapProjectProposalError(saveError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ComponentCard
      title={`Revision ${revision.revisionNo} Details`}
      desc={editable ? "Edit customer-facing Proposal header fields for this draft revision." : "This revision is read-only at its current lifecycle state."}
    >
      {error ? <Alert variant="error" title="Proposal details not saved" message={error} /> : null}
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor={`proposal-currency-${revision.id}`}>Currency</Label>
          <Input
            id={`proposal-currency-${revision.id}`}
            value={currencyCode}
            maxLength={3}
            onChange={(event) => setCurrencyCode(event.target.value.toUpperCase())}
            disabled={!editable}
          />
        </div>
        <div>
          <Label htmlFor={`proposal-valid-until-${revision.id}`}>Valid Until</Label>
          <Input
            id={`proposal-valid-until-${revision.id}`}
            type="date"
            value={validUntil}
            onChange={(event) => setValidUntil(event.target.value)}
            disabled={!editable}
          />
        </div>
      </div>
      <div>
        <Label htmlFor={`proposal-customer-message-${revision.id}`}>Customer Message</Label>
        <TextArea id={`proposal-customer-message-${revision.id}`} value={customerMessage} onChange={setCustomerMessage} disabled={!editable} />
      </div>
      <div>
        <Label htmlFor={`proposal-terms-${revision.id}`}>Terms</Label>
        <TextArea id={`proposal-terms-${revision.id}`} rows={5} value={termsText} onChange={setTermsText} disabled={!editable} />
      </div>
      <div>
        <Label htmlFor={`proposal-revision-note-${revision.id}`}>Revision Note</Label>
        <TextArea id={`proposal-revision-note-${revision.id}`} value={revisionNote} onChange={setRevisionNote} disabled={!editable} />
      </div>
      {editable ? (
        <div className="flex justify-end">
          <Button onClick={() => void save()} disabled={saving}>{saving ? "Saving…" : "Save Proposal Details"}</Button>
        </div>
      ) : null}
    </ComponentCard>
  );
}
