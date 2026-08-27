"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { canAccessPath, ROLE_LABELS } from "@/lib/auth/permissions";
import { getCurrentProfile, type Profile, type UserRole } from "@/lib/supabase/profile";
import {
  TRAINING_CATEGORIES,
  TRAINING_LESSONS,
  type TrainingCategory,
  type TrainingLesson,
} from "@/lib/training/content";

const cardClass =
  "rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-gray-900";

function resolveLessonPath(lesson: TrainingLesson, role: UserRole) {
  if (lesson.id === "payroll-processing" && role === "hr") return "/personnel/payroll";
  if (lesson.id === "hr-compensation" && role === "finance") return "/finance/compensation";
  return lesson.path;
}

function readProgress(storageKey: string) {
  try {
    const raw = window.localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? new Set<string>(parsed.filter((value) => typeof value === "string")) : new Set<string>();
  } catch {
    return new Set<string>();
  }
}

export default function TrainingCenter() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<TrainingCategory | "All">("All");
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [openLessonId, setOpenLessonId] = useState<string | null>(null);

  const storageKey = profile ? `oakwell-training-progress:${profile.id}` : "oakwell-training-progress:anonymous";

  useEffect(() => {
    let active = true;
    void getCurrentProfile().then(({ profile: nextProfile }) => {
      if (!active) return;
      setProfile(nextProfile);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!profile) return;
    setCompleted(readProgress(storageKey));
  }, [profile, storageKey]);

  const visibleLessons = useMemo(() => {
    if (!profile) return [];
    const normalized = query.trim().toLowerCase();
    return TRAINING_LESSONS.filter((lesson) => lesson.roles.includes(profile.role))
      .filter((lesson) => category === "All" || lesson.category === category)
      .filter((lesson) => {
        if (!normalized) return true;
        const haystack = [lesson.title, lesson.category, lesson.summary, ...lesson.steps, ...(lesson.bestPractices ?? []), ...(lesson.warnings ?? [])]
          .join(" ")
          .toLowerCase();
        return haystack.includes(normalized);
      });
  }, [profile, query, category]);

  const roleLessons = useMemo(
    () => (profile ? TRAINING_LESSONS.filter((lesson) => lesson.roles.includes(profile.role)) : []),
    [profile],
  );

  const completedCount = roleLessons.filter((lesson) => completed.has(lesson.id)).length;
  const progress = roleLessons.length ? Math.round((completedCount / roleLessons.length) * 100) : 0;
  const estimatedMinutes = roleLessons.reduce((sum, lesson) => sum + lesson.durationMinutes, 0);

  function toggleComplete(lessonId: string) {
    const next = new Set(completed);
    if (next.has(lessonId)) next.delete(lessonId);
    else next.add(lessonId);
    setCompleted(next);
    window.localStorage.setItem(storageKey, JSON.stringify([...next]));
  }

  if (loading) {
    return <div className={`${cardClass} p-6 text-sm text-gray-500`}>Loading your training path…</div>;
  }

  if (!profile) {
    return <div className={`${cardClass} p-6 text-sm text-error-600`}>Your user profile could not be loaded.</div>;
  }

  const roleLabel = ROLE_LABELS[profile.role];

  return (
    <div className="space-y-6">
      <section className={`${cardClass} overflow-hidden`}>
        <div className="border-b border-gray-100 p-6 dark:border-gray-800">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm font-medium text-brand-500">Oakwell Cabinetry Admin</p>
              <h1 className="mt-1 text-2xl font-semibold text-gray-800 dark:text-white/90">Help & Training Center</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500 dark:text-gray-400">
                Role-based operating guides for the workflows available to your account. Follow the lessons in order when you are new, or search for a specific task when you need a refresher.
              </p>
            </div>
            <div className="rounded-xl bg-gray-50 px-4 py-3 text-sm dark:bg-white/[0.03]">
              <p className="text-xs uppercase tracking-wide text-gray-400">Your training path</p>
              <p className="mt-1 font-semibold text-gray-800 dark:text-white/90">{roleLabel}</p>
              <p className="mt-1 text-xs text-gray-500">{roleLessons.length} lessons · about {estimatedMinutes} min</p>
            </div>
          </div>
        </div>

        <div className="p-6">
          <div className="flex items-center justify-between gap-4 text-sm">
            <span className="font-medium text-gray-700 dark:text-gray-300">Training progress</span>
            <span className="text-gray-500">{completedCount}/{roleLessons.length} completed · {progress}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
            <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-2 text-xs text-gray-400">Progress is saved in this browser for your signed-in account.</p>
        </div>
      </section>

      <section className={`${cardClass} p-5`}>
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search training: order, payroll, QR, leave…"
            className="h-11 rounded-lg border border-gray-300 bg-white px-4 text-sm text-gray-800 outline-none focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          />
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value as TrainingCategory | "All")}
            className="h-11 rounded-lg border border-gray-300 bg-white px-4 text-sm text-gray-800 outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          >
            <option value="All">All categories</option>
            {TRAINING_CATEGORIES.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </div>
      </section>

      <section className="space-y-4">
        {visibleLessons.map((lesson, index) => {
          const isComplete = completed.has(lesson.id);
          const isOpen = openLessonId === lesson.id;
          const resolvedPath = resolveLessonPath(lesson, profile.role);
          const canOpenModule = resolvedPath ? canAccessPath(profile.role, resolvedPath) : false;

          return (
            <article key={lesson.id} className={cardClass}>
              <button
                type="button"
                onClick={() => setOpenLessonId(isOpen ? null : lesson.id)}
                className="flex w-full items-start justify-between gap-4 p-5 text-left"
              >
                <div className="flex min-w-0 gap-4">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${isComplete ? "bg-success-50 text-success-600 dark:bg-success-500/10 dark:text-success-400" : "bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400"}`}>
                    {isComplete ? "✓" : index + 1}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold text-gray-800 dark:text-white/90">{lesson.title}</h2>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500 dark:bg-gray-800">{lesson.category}</span>
                      <span className="text-xs text-gray-400">{lesson.durationMinutes} min</span>
                    </div>
                    <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">{lesson.summary}</p>
                  </div>
                </div>
                <span className="mt-1 shrink-0 text-gray-400">{isOpen ? "−" : "+"}</span>
              </button>

              {isOpen && (
                <div className="border-t border-gray-100 p-5 dark:border-gray-800">
                  <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">Step by step</h3>
                      <ol className="mt-3 space-y-3">
                        {lesson.steps.map((step, stepIndex) => (
                          <li key={step} className="flex gap-3 text-sm leading-6 text-gray-600 dark:text-gray-300">
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">{stepIndex + 1}</span>
                            <span>{step}</span>
                          </li>
                        ))}
                      </ol>
                    </div>

                    <aside className="space-y-4">
                      {lesson.bestPractices?.length ? (
                        <div className="rounded-xl border border-success-200 bg-success-50 p-4 dark:border-success-500/20 dark:bg-success-500/10">
                          <h3 className="text-sm font-semibold text-success-700 dark:text-success-300">Best practice</h3>
                          <ul className="mt-2 space-y-2 text-sm leading-5 text-success-700/90 dark:text-success-300/90">
                            {lesson.bestPractices.map((item) => <li key={item}>• {item}</li>)}
                          </ul>
                        </div>
                      ) : null}

                      {lesson.warnings?.length ? (
                        <div className="rounded-xl border border-warning-200 bg-warning-50 p-4 dark:border-warning-500/20 dark:bg-warning-500/10">
                          <h3 className="text-sm font-semibold text-warning-800 dark:text-warning-300">Important</h3>
                          <ul className="mt-2 space-y-2 text-sm leading-5 text-warning-800/90 dark:text-warning-300/90">
                            {lesson.warnings.map((item) => <li key={item}>• {item}</li>)}
                          </ul>
                        </div>
                      ) : null}

                      <div className="flex flex-col gap-2">
                        {resolvedPath && canOpenModule ? (
                          <Link href={resolvedPath} className="inline-flex h-10 items-center justify-center rounded-lg border border-brand-500 px-4 text-sm font-medium text-brand-600 transition hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-500/10">
                            Open related module
                          </Link>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => toggleComplete(lesson.id)}
                          className={`h-10 rounded-lg px-4 text-sm font-medium transition ${isComplete ? "border border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]" : "bg-brand-500 text-white hover:bg-brand-600"}`}
                        >
                          {isComplete ? "Mark as not completed" : "Mark lesson completed"}
                        </button>
                      </div>
                    </aside>
                  </div>
                </div>
              )}
            </article>
          );
        })}

        {visibleLessons.length === 0 ? (
          <div className={`${cardClass} p-8 text-center text-sm text-gray-500`}>No training lessons match your search.</div>
        ) : null}
      </section>

      <section className={`${cardClass} p-5`}>
        <h2 className="font-semibold text-gray-800 dark:text-white/90">Before you change real data</h2>
        <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
          New users should complete the Getting Started lessons and the lessons for their primary workflow before making production changes. When a workflow is unclear, stop before confirming the action and ask the process owner or an Admin.
        </p>
      </section>
    </div>
  );
}
