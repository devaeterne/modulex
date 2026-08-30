"use client";

import { useCallback, useEffect, useState } from "react";
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
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${status === "published" ? "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400" : "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-400"}`}>
      {status}
    </span>
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
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [{ profile, error: profileError }, content] = await Promise.all([
        getCurrentProfile(),
        loadCabinetContent(),
      ]);
      if (profileError) throw profileError;
      setCanEdit(["super_admin", "admin"].includes(profile?.role ?? ""));
      setSteps(content.steps);
      setFaqs(content.faqs);
      setNewStep(emptyProcess((content.steps.at(-1)?.sort_order ?? 0) + 10));
      setNewFaq(emptyFaq((content.faqs.at(-1)?.sort_order ?? 0) + 10));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load Cabinet Content.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Cabinet Content update failed.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <div className="rounded-2xl border border-gray-200 bg-white p-8 text-sm text-gray-500 dark:border-gray-800 dark:bg-gray-900">Loading Cabinet Content...</div>;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-gray-800 dark:text-white/90">Cabinet Content</h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-gray-500 dark:text-gray-400">
              Manage the cabinet planning process and Oakwell cabinetry FAQ. Drafts stay private; publishing is always explicit.
            </p>
          </div>
          <a href="/store/pages" className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 dark:border-gray-700 dark:text-gray-300">
            Edit page SEO & copy
          </a>
        </div>
        {error ? <p className="mt-3 text-sm text-error-600 dark:text-error-400">{error}</p> : null}
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900 sm:p-6">
        <div className="mb-5">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Cabinet Planning Process</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Source-adapted steps retain their Granite & Cabinet Center source URL internally; the public RPC does not expose provenance.</p>
        </div>

        <div className="space-y-4">
          {steps.map((step) => (
            <ProcessRow key={step.id} step={step} disabled={!canEdit || busy} run={run} />
          ))}
          {steps.length === 0 ? <p className="text-sm text-gray-500">No process steps yet.</p> : null}
        </div>

        <div className="mt-6 border-t border-gray-200 pt-5 dark:border-gray-800">
          <h3 className="mb-3 text-sm font-semibold text-gray-800 dark:text-white/90">Add process step</h3>
          <ProcessFields value={newStep} onChange={setNewStep} disabled={!canEdit || busy} />
          <button
            type="button"
            disabled={!canEdit || busy}
            onClick={() => run(() => saveProcessStep(null, { ...newStep, source_page_url: newStep.source_page_url || null }))}
            className="mt-3 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Save draft step
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900 sm:p-6">
        <div className="mb-5">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Cabinet FAQ</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">FAQ copy is Oakwell-authored managed content; Granite&apos;s stone FAQ is not imported.</p>
        </div>

        <div className="space-y-4">
          {faqs.map((faq) => (
            <FaqRow key={faq.id} faq={faq} disabled={!canEdit || busy} run={run} />
          ))}
          {faqs.length === 0 ? <p className="text-sm text-gray-500">No FAQ entries yet.</p> : null}
        </div>

        <div className="mt-6 border-t border-gray-200 pt-5 dark:border-gray-800">
          <h3 className="mb-3 text-sm font-semibold text-gray-800 dark:text-white/90">Add FAQ</h3>
          <FaqFields value={newFaq} onChange={setNewFaq} disabled={!canEdit || busy} />
          <button
            type="button"
            disabled={!canEdit || busy}
            onClick={() => run(() => saveFaqEntry(null, { ...newFaq, source_page_url: newFaq.source_page_url || null }))}
            className="mt-3 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Save draft FAQ
          </button>
        </div>
      </section>
    </div>
  );
}

function ProcessRow({ step, disabled, run }: { step: StoreProcessStep; disabled: boolean; run: (action: () => Promise<void>) => Promise<void> }) {
  const [draft, setDraft] = useState<ProcessDraft>({
    id: step.id,
    title: step.title,
    body: step.body,
    sort_order: step.sort_order,
    source_page_url: step.source_page_url ?? "",
    attribution_classification: step.attribution_classification,
  });
  return (
    <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
      <div className="mb-3 flex items-center justify-between gap-3">
        <StatusBadge status={step.status} />
        <span className="text-xs text-gray-400">Updated {new Date(step.updated_at).toLocaleString()}</span>
      </div>
      <ProcessFields value={draft} onChange={setDraft} disabled={disabled} />
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={disabled} onClick={() => run(() => saveProcessStep(step.id, { ...draft, source_page_url: draft.source_page_url || null }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700">Save as draft</button>
        <button type="button" disabled={disabled} onClick={() => run(() => setProcessStepPublished(step.id, step.status !== "published"))} className="rounded-lg bg-brand-500 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">{step.status === "published" ? "Unpublish" : "Publish"}</button>
        <button type="button" disabled={disabled} onClick={() => run(() => deleteProcessStep(step.id))} className="rounded-lg border border-error-300 px-3 py-2 text-sm text-error-600 dark:border-error-500/40">Delete</button>
      </div>
    </div>
  );
}

function FaqRow({ faq, disabled, run }: { faq: StoreFaqEntry; disabled: boolean; run: (action: () => Promise<void>) => Promise<void> }) {
  const [draft, setDraft] = useState<FaqDraft>({
    id: faq.id,
    question: faq.question,
    answer: faq.answer,
    sort_order: faq.sort_order,
    source_page_url: faq.source_page_url ?? "",
    attribution_classification: faq.attribution_classification,
  });
  return (
    <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
      <div className="mb-3 flex items-center justify-between gap-3">
        <StatusBadge status={faq.status} />
        <span className="text-xs text-gray-400">Updated {new Date(faq.updated_at).toLocaleString()}</span>
      </div>
      <FaqFields value={draft} onChange={setDraft} disabled={disabled} />
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={disabled} onClick={() => run(() => saveFaqEntry(faq.id, { ...draft, source_page_url: draft.source_page_url || null }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700">Save as draft</button>
        <button type="button" disabled={disabled} onClick={() => run(() => setFaqEntryPublished(faq.id, faq.status !== "published"))} className="rounded-lg bg-brand-500 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">{faq.status === "published" ? "Unpublish" : "Publish"}</button>
        <button type="button" disabled={disabled} onClick={() => run(() => deleteFaqEntry(faq.id))} className="rounded-lg border border-error-300 px-3 py-2 text-sm text-error-600 dark:border-error-500/40">Delete</button>
      </div>
    </div>
  );
}

function ProcessFields({ value, onChange, disabled }: { value: ProcessDraft; onChange: (next: ProcessDraft) => void; disabled: boolean }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <label className="text-sm text-gray-600 dark:text-gray-300">Title<input disabled={disabled} value={value.title} onChange={(event) => onChange({ ...value, title: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 dark:border-gray-700" /></label>
      <label className="text-sm text-gray-600 dark:text-gray-300">Sort order<input disabled={disabled} type="number" min={0} value={value.sort_order} onChange={(event) => onChange({ ...value, sort_order: Number(event.target.value) })} className="mt-1 w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 dark:border-gray-700" /></label>
      <label className="text-sm text-gray-600 dark:text-gray-300 md:col-span-2">Body<textarea disabled={disabled} rows={3} value={value.body} onChange={(event) => onChange({ ...value, body: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 dark:border-gray-700" /></label>
      <label className="text-sm text-gray-600 dark:text-gray-300">Source page URL<input disabled={disabled} value={value.source_page_url} onChange={(event) => onChange({ ...value, source_page_url: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 dark:border-gray-700" /></label>
      <label className="text-sm text-gray-600 dark:text-gray-300">Attribution<select disabled={disabled} value={value.attribution_classification} onChange={(event) => onChange({ ...value, attribution_classification: event.target.value as CabinetContentAttribution })} className="mt-1 w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 dark:border-gray-700"><option value="adapted_parent_source">Adapted parent source</option><option value="original_oakwell">Original Oakwell</option></select></label>
    </div>
  );
}

function FaqFields({ value, onChange, disabled }: { value: FaqDraft; onChange: (next: FaqDraft) => void; disabled: boolean }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <label className="text-sm text-gray-600 dark:text-gray-300">Question<input disabled={disabled} value={value.question} onChange={(event) => onChange({ ...value, question: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 dark:border-gray-700" /></label>
      <label className="text-sm text-gray-600 dark:text-gray-300">Sort order<input disabled={disabled} type="number" min={0} value={value.sort_order} onChange={(event) => onChange({ ...value, sort_order: Number(event.target.value) })} className="mt-1 w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 dark:border-gray-700" /></label>
      <label className="text-sm text-gray-600 dark:text-gray-300 md:col-span-2">Answer<textarea disabled={disabled} rows={3} value={value.answer} onChange={(event) => onChange({ ...value, answer: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 dark:border-gray-700" /></label>
      <label className="text-sm text-gray-600 dark:text-gray-300">Source page URL (optional)<input disabled={disabled} value={value.source_page_url} onChange={(event) => onChange({ ...value, source_page_url: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 dark:border-gray-700" /></label>
      <label className="text-sm text-gray-600 dark:text-gray-300">Attribution<select disabled={disabled} value={value.attribution_classification} onChange={(event) => onChange({ ...value, attribution_classification: event.target.value as CabinetContentAttribution })} className="mt-1 w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 dark:border-gray-700"><option value="original_oakwell">Original Oakwell</option><option value="adapted_parent_source">Adapted parent source</option></select></label>
    </div>
  );
}
