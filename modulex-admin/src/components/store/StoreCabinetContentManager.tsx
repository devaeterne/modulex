"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import Label from "@/components/form/Label";
import Select from "@/components/form/Select";
import Input from "@/components/form/input/InputField";
import TextArea from "@/components/form/input/TextArea";
import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { hasPermission } from "@/lib/auth/permissions";
import { getCurrentProfile } from "@/lib/supabase/profile";
import {
  deleteFaqEntry,
  deleteProcessStep,
  loadCabinetContent,
  saveFaqEntry,
  saveProcessStep,
  setFaqEntryPublished,
  setProcessStepPublished,
  type CabinetContentAttribution,
  type StoreFaqEntry,
  type StoreProcessStep,
} from "@/lib/store/cabinetContent";

const SOURCE_PAGE = "https://granitecenterva.com/kitchen-cabinet-sale/";
const PROCESS_ATTRIBUTION_OPTIONS = [
  { value: "adapted_parent_source", label: "Adapted parent source" },
  { value: "original_oakwell", label: "Original Oakwell" },
];
const FAQ_ATTRIBUTION_OPTIONS = [
  { value: "original_oakwell", label: "Original Oakwell" },
  { value: "adapted_parent_source", label: "Adapted parent source" },
];

type ProcessDraft = {
  id: string | null;
  title: string;
  body: string;
  sort_order: number;
  source_page_url: string;
  attribution_classification: CabinetContentAttribution;
};

type FaqDraft = {
  id: string | null;
  question: string;
  answer: string;
  sort_order: number;
  source_page_url: string;
  attribution_classification: CabinetContentAttribution;
};

function emptyProcess(sortOrder: number): ProcessDraft {
  return {
    id: null,
    title: "",
    body: "",
    sort_order: sortOrder,
    source_page_url: SOURCE_PAGE,
    attribution_classification: "adapted_parent_source",
  };
}

function emptyFaq(sortOrder: number): FaqDraft {
  return {
    id: null,
    question: "",
    answer: "",
    sort_order: sortOrder,
    source_page_url: "",
    attribution_classification: "original_oakwell",
  };
}

function StatusBadge({ status }: { status: "draft" | "published" }) {
  return (
    <Badge color={status === "published" ? "success" : "light"} size="sm">
      {status === "published" ? "Published" : "Draft"}
    </Badge>
  );
}

export default function StoreCabinetContentManager() {
  const [steps, setSteps] = useState<StoreProcessStep[]>([]);
  const [faqs, setFaqs] = useState<StoreFaqEntry[]>([]);
  const [newStep, setNewStep] = useState<ProcessDraft>(() => emptyProcess(10));
  const [newFaq, setNewFaq] = useState<FaqDraft>(() => emptyFaq(10));
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    setError(null);
    try {
      const [{ profile, error: profileError }, content] = await Promise.all([
        getCurrentProfile(),
        loadCabinetContent(),
      ]);
      if (profileError) throw profileError;
      setCanEdit(hasPermission(profile?.roles, "store.manage"));
      setSteps(content.steps);
      setFaqs(content.faqs);
      setNewStep(emptyProcess((content.steps.at(-1)?.sort_order ?? 0) + 10));
      setNewFaq(emptyFaq((content.faqs.at(-1)?.sort_order ?? 0) + 10));
    } catch (caught) {
      console.error("Failed to load Cabinet Content", caught);
      setLoadFailed(true);
      setError("Cabinet Content could not be loaded. Please retry.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setLoadFailed(false);
    setError(null);
    try {
      await action();
      await load();
    } catch (caught) {
      console.error("Cabinet Content update failed", caught);
      setError("Cabinet Content update failed. Check the values and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <Alert
        variant="info"
        title="Loading Cabinet Content"
        message="Cabinet planning and FAQ content is being loaded."
      />
    );
  }

  if (loadFailed) {
    return (
      <div className="space-y-3">
        <Alert
          variant="error"
          title="Cabinet Content unavailable"
          message={error ?? "Cabinet Content could not be loaded."}
        />
        <Button variant="outline" onClick={() => void load()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ComponentCard
        title="Cabinet Content"
        desc="Manage the cabinet planning process and Oakwell cabinetry FAQ. Drafts stay private; publishing is always explicit."
        headerAction={
          <div className="flex flex-wrap items-center justify-end gap-3">
            <Badge color={canEdit ? "success" : "light"}>{canEdit ? "Manage" : "View only"}</Badge>
            <Link
              href="/store/pages"
              className="text-sm font-medium text-brand-500 underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 dark:text-brand-400"
            >
              Edit page SEO & copy
            </Link>
          </div>
        }
      >
        {error ? <Alert variant="error" title="Unable to update Cabinet Content" message={error} /> : null}
      </ComponentCard>

      <ComponentCard
        title="Cabinet Planning Process"
        desc="Source-adapted steps retain their Granite & Cabinet Center source URL internally; the public RPC does not expose provenance."
      >
        <div className="space-y-4">
          {steps.map((step) => (
            <ProcessRow key={step.id} step={step} disabled={!canEdit || busy} run={run} />
          ))}
          {steps.length === 0 ? (
            <Alert variant="info" title="No process steps" message="Add the first cabinet planning process step below." />
          ) : null}
        </div>

        <ComponentCard
          title="Add process step"
          desc="Create a private draft first. Publishing remains a separate explicit action."
        >
          <ProcessFields value={newStep} onChange={setNewStep} disabled={!canEdit || busy} prefix="new-process" />
          <div className="flex justify-end">
            <Button
              disabled={!canEdit || busy}
              onClick={() =>
                void run(() =>
                  saveProcessStep(null, {
                    ...newStep,
                    source_page_url: newStep.source_page_url || null,
                  }),
                )
              }
            >
              Save draft step
            </Button>
          </div>
        </ComponentCard>
      </ComponentCard>

      <ComponentCard
        title="Cabinet FAQ"
        desc="FAQ copy is Oakwell-authored managed content; Granite's stone FAQ is not imported."
      >
        <div className="space-y-4">
          {faqs.map((faq) => (
            <FaqRow key={faq.id} faq={faq} disabled={!canEdit || busy} run={run} />
          ))}
          {faqs.length === 0 ? (
            <Alert variant="info" title="No FAQ entries" message="Add the first Oakwell cabinetry FAQ entry below." />
          ) : null}
        </div>

        <ComponentCard
          title="Add FAQ"
          desc="Create a private FAQ draft first. Publishing remains a separate explicit action."
        >
          <FaqFields value={newFaq} onChange={setNewFaq} disabled={!canEdit || busy} prefix="new-faq" />
          <div className="flex justify-end">
            <Button
              disabled={!canEdit || busy}
              onClick={() =>
                void run(() =>
                  saveFaqEntry(null, {
                    ...newFaq,
                    source_page_url: newFaq.source_page_url || null,
                  }),
                )
              }
            >
              Save draft FAQ
            </Button>
          </div>
        </ComponentCard>
      </ComponentCard>
    </div>
  );
}

function ProcessRow({
  step,
  disabled,
  run,
}: {
  step: StoreProcessStep;
  disabled: boolean;
  run: (action: () => Promise<void>) => Promise<void>;
}) {
  const [draft, setDraft] = useState<ProcessDraft>({
    id: step.id,
    title: step.title,
    body: step.body,
    sort_order: step.sort_order,
    source_page_url: step.source_page_url ?? "",
    attribution_classification: step.attribution_classification,
  });

  return (
    <ComponentCard
      title={step.title || "Process step"}
      desc={`Updated ${new Date(step.updated_at).toLocaleString()}`}
      headerAction={<StatusBadge status={step.status} />}
    >
      <ProcessFields value={draft} onChange={setDraft} disabled={disabled} prefix={`process-${step.id}`} />
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() =>
            void run(() =>
              saveProcessStep(step.id, {
                ...draft,
                source_page_url: draft.source_page_url || null,
              }),
            )
          }
        >
          Save as draft
        </Button>
        <Button
          size="sm"
          variant={step.status === "published" ? "outline" : "primary"}
          disabled={disabled}
          onClick={() => void run(() => setProcessStepPublished(step.id, step.status !== "published"))}
        >
          {step.status === "published" ? "Unpublish" : "Publish"}
        </Button>
        <Button
          size="sm"
          variant="danger"
          disabled={disabled}
          onClick={() => void run(() => deleteProcessStep(step.id))}
        >
          Delete
        </Button>
      </div>
    </ComponentCard>
  );
}

function FaqRow({
  faq,
  disabled,
  run,
}: {
  faq: StoreFaqEntry;
  disabled: boolean;
  run: (action: () => Promise<void>) => Promise<void>;
}) {
  const [draft, setDraft] = useState<FaqDraft>({
    id: faq.id,
    question: faq.question,
    answer: faq.answer,
    sort_order: faq.sort_order,
    source_page_url: faq.source_page_url ?? "",
    attribution_classification: faq.attribution_classification,
  });

  return (
    <ComponentCard
      title={faq.question || "FAQ entry"}
      desc={`Updated ${new Date(faq.updated_at).toLocaleString()}`}
      headerAction={<StatusBadge status={faq.status} />}
    >
      <FaqFields value={draft} onChange={setDraft} disabled={disabled} prefix={`faq-${faq.id}`} />
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() =>
            void run(() =>
              saveFaqEntry(faq.id, {
                ...draft,
                source_page_url: draft.source_page_url || null,
              }),
            )
          }
        >
          Save as draft
        </Button>
        <Button
          size="sm"
          variant={faq.status === "published" ? "outline" : "primary"}
          disabled={disabled}
          onClick={() => void run(() => setFaqEntryPublished(faq.id, faq.status !== "published"))}
        >
          {faq.status === "published" ? "Unpublish" : "Publish"}
        </Button>
        <Button
          size="sm"
          variant="danger"
          disabled={disabled}
          onClick={() => void run(() => deleteFaqEntry(faq.id))}
        >
          Delete
        </Button>
      </div>
    </ComponentCard>
  );
}

function ProcessFields({
  value,
  onChange,
  disabled,
  prefix,
}: {
  value: ProcessDraft;
  onChange: (next: ProcessDraft) => void;
  disabled: boolean;
  prefix: string;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div>
        <Label htmlFor={`${prefix}-title`}>Title</Label>
        <Input
          id={`${prefix}-title`}
          disabled={disabled}
          value={value.title}
          onChange={(event) => onChange({ ...value, title: event.target.value })}
        />
      </div>
      <div>
        <Label htmlFor={`${prefix}-sort-order`}>Sort order</Label>
        <Input
          id={`${prefix}-sort-order`}
          disabled={disabled}
          type="number"
          min={0}
          value={value.sort_order}
          onChange={(event) => onChange({ ...value, sort_order: Number(event.target.value) })}
        />
      </div>
      <div className="md:col-span-2">
        <Label htmlFor={`${prefix}-body`}>Body</Label>
        <TextArea
          id={`${prefix}-body`}
          disabled={disabled}
          rows={3}
          value={value.body}
          onChange={(body) => onChange({ ...value, body })}
        />
      </div>
      <div>
        <Label htmlFor={`${prefix}-source-url`}>Source page URL</Label>
        <Input
          id={`${prefix}-source-url`}
          disabled={disabled}
          type="url"
          value={value.source_page_url}
          onChange={(event) => onChange({ ...value, source_page_url: event.target.value })}
        />
      </div>
      <div>
        <Label htmlFor={`${prefix}-attribution`}>Attribution</Label>
        <Select
          id={`${prefix}-attribution`}
          disabled={disabled}
          options={PROCESS_ATTRIBUTION_OPTIONS}
          value={value.attribution_classification}
          onChange={(attribution_classification) =>
            onChange({
              ...value,
              attribution_classification: attribution_classification as CabinetContentAttribution,
            })
          }
        />
      </div>
    </div>
  );
}

function FaqFields({
  value,
  onChange,
  disabled,
  prefix,
}: {
  value: FaqDraft;
  onChange: (next: FaqDraft) => void;
  disabled: boolean;
  prefix: string;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div>
        <Label htmlFor={`${prefix}-question`}>Question</Label>
        <Input
          id={`${prefix}-question`}
          disabled={disabled}
          value={value.question}
          onChange={(event) => onChange({ ...value, question: event.target.value })}
        />
      </div>
      <div>
        <Label htmlFor={`${prefix}-sort-order`}>Sort order</Label>
        <Input
          id={`${prefix}-sort-order`}
          disabled={disabled}
          type="number"
          min={0}
          value={value.sort_order}
          onChange={(event) => onChange({ ...value, sort_order: Number(event.target.value) })}
        />
      </div>
      <div className="md:col-span-2">
        <Label htmlFor={`${prefix}-answer`}>Answer</Label>
        <TextArea
          id={`${prefix}-answer`}
          disabled={disabled}
          rows={3}
          value={value.answer}
          onChange={(answer) => onChange({ ...value, answer })}
        />
      </div>
      <div>
        <Label htmlFor={`${prefix}-source-url`}>Source page URL (optional)</Label>
        <Input
          id={`${prefix}-source-url`}
          disabled={disabled}
          type="url"
          value={value.source_page_url}
          onChange={(event) => onChange({ ...value, source_page_url: event.target.value })}
        />
      </div>
      <div>
        <Label htmlFor={`${prefix}-attribution`}>Attribution</Label>
        <Select
          id={`${prefix}-attribution`}
          disabled={disabled}
          options={FAQ_ATTRIBUTION_OPTIONS}
          value={value.attribution_classification}
          onChange={(attribution_classification) =>
            onChange({
              ...value,
              attribution_classification: attribution_classification as CabinetContentAttribution,
            })
          }
        />
      </div>
    </div>
  );
}
