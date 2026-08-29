"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import StoreProjectEditor from "@/components/store/StoreProjectEditor";
import StoreProjectMediaManager from "@/components/store/StoreProjectMediaManager";
import { hasPermission } from "@/lib/auth/permissions";
import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { isProjectSlug, type StoreProject } from "@/lib/store/secondaryCms";

const PROJECT_SELECT = "id,slug,status,title,summary,category,location,cover_image_url,cover_image_alt,cover_media_asset_id,attribution_classification,attribution_text,source_page_url,sort_order,seo_title,seo_description,og_image_url,published_at,updated_at";

const inputClass =
  "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-theme-xs outline-none transition focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 disabled:bg-gray-50 disabled:text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:disabled:bg-gray-800";
const primaryButton =
  "inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600 disabled:opacity-50";
const dangerButton =
  "inline-flex h-9 items-center justify-center rounded-lg border border-error-200 bg-error-50 px-3 text-xs font-medium text-error-700 disabled:opacity-50 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400";

export default function StoreProjectsManager() {
  const [projects, setProjects] = useState<StoreProject[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { profile, error: profileError } = await getCurrentProfile();
    if (profileError) {
      setError(profileError.message);
      setLoading(false);
      return;
    }
    setCanEdit(hasPermission(profile?.roles, "store.manage"));

    const { data, error: projectsError } = await supabase
      .from("store_projects")
      .select(PROJECT_SELECT)
      .order("sort_order", { ascending: true })
      .order("title", { ascending: true });
    if (projectsError) setError(projectsError.message);
    else {
      const rows = (data ?? []) as StoreProject[];
      setProjects(rows);
      setSelectedId((current) => current && rows.some((row) => row.id === current) ? current : rows[0]?.id ?? null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return projects;
    return projects.filter((project) => project.title.toLowerCase().includes(needle) || project.slug.toLowerCase().includes(needle));
  }, [projects, query]);

  const selected = projects.find((project) => project.id === selectedId) ?? null;

  async function createProject() {
    if (!canEdit) return;
    const title = newTitle.trim();
    const slug = newSlug.trim().toLowerCase();
    if (!title) return setError("Project title is required.");
    if (!isProjectSlug(slug)) return setError("Project slug must use lowercase letters, numbers and single hyphens only.");
    if (projects.some((project) => project.slug === slug)) return setError("Project slug must be unique.");

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) return setError(userError?.message ?? "Unable to verify current user.");

    setBusy(true);
    setError(null);
    const { data, error: insertError } = await supabase
      .from("store_projects")
      .insert({ title, slug, status: "draft", sort_order: 0, attribution_classification: "oakwell_owned", updated_by: user.id })
      .select(PROJECT_SELECT)
      .single();
    if (insertError) setError(insertError.message);
    else {
      const created = data as StoreProject;
      setProjects((current) => [...current, created]);
      setSelectedId(created.id);
      setNewTitle("");
      setNewSlug("");
    }
    setBusy(false);
  }

  async function deleteProject(project: StoreProject) {
    if (!canEdit || project.status === "published") return;
    if (!window.confirm(`Delete draft project “${project.title}”? Its media records will also be removed.`)) return;
    setBusy(true);
    setError(null);
    const { error: deleteError } = await supabase.from("store_projects").delete().eq("id", project.id);
    if (deleteError) setError(deleteError.message);
    else {
      const next = projects.filter((row) => row.id !== project.id);
      setProjects(next);
      setSelectedId(next[0]?.id ?? null);
    }
    setBusy(false);
  }

  function handleSaved(saved: StoreProject) {
    setProjects((current) => current.map((project) => (project.id === saved.id ? saved : project)));
  }

  if (loading) {
    return <div className="rounded-2xl border border-gray-200 bg-white p-8 text-sm text-gray-500 dark:border-gray-800 dark:bg-gray-900">Loading Store projects...</div>;
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
      <aside className="space-y-5">
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900">
          <h1 className="text-xl font-semibold text-gray-800 dark:text-white/90">Projects</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Create drafts, link reviewed Media Library assets, then explicitly publish when ready.</p>
          {error ? <p className="mt-3 rounded-lg bg-error-50 px-3 py-2 text-sm text-error-700 dark:bg-error-500/10 dark:text-error-400">{error}</p> : null}
          <input className={`${inputClass} mt-4`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title or slug" />
        </section>

        {canEdit ? (
          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900">
            <h2 className="text-sm font-semibold text-gray-800 dark:text-white/90">New draft project</h2>
            <div className="mt-4 space-y-3">
              <input className={inputClass} value={newTitle} disabled={busy} onChange={(event) => setNewTitle(event.target.value)} placeholder="Project title" />
              <input className={inputClass} value={newSlug} disabled={busy} onChange={(event) => setNewSlug(event.target.value.toLowerCase().trim())} placeholder="project-slug" />
              <button type="button" className={primaryButton} disabled={busy} onClick={() => void createProject()}>Create draft</button>
            </div>
          </section>
        ) : null}

        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-gray-900">
          {filtered.length === 0 ? <p className="p-5 text-sm text-gray-500">No projects match this search.</p> : null}
          {filtered.map((project) => (
            <div key={project.id} className={`border-b border-gray-100 p-4 last:border-b-0 dark:border-gray-800 ${selectedId === project.id ? "bg-brand-50/60 dark:bg-brand-500/10" : ""}`}>
              <button type="button" className="w-full text-left" onClick={() => setSelectedId(project.id)}>
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-sm font-medium text-gray-800 dark:text-white/90">{project.title}</span>
                  <span className="text-xs text-gray-500">{project.status}</span>
                </div>
                <p className="mt-1 truncate text-xs text-gray-500">/{project.slug} · sort {project.sort_order}</p>
              </button>
              {canEdit && project.status !== "published" ? (
                <button type="button" className={`${dangerButton} mt-3`} disabled={busy} onClick={() => void deleteProject(project)}>Delete draft</button>
              ) : null}
            </div>
          ))}
        </section>
      </aside>

      <main className="min-w-0 space-y-5">
        {selected ? (
          <>
            <StoreProjectEditor
              project={selected}
              canEdit={canEdit}
              conflictingSlugs={projects.filter((project) => project.id !== selected.id).map((project) => project.slug)}
              onSaved={handleSaved}
            />
            <StoreProjectMediaManager projectId={selected.id} canEdit={canEdit} />
          </>
        ) : (
          <div className="rounded-2xl border border-gray-200 bg-white p-8 text-sm text-gray-500 dark:border-gray-800 dark:bg-gray-900">Create or select a project to edit it.</div>
        )}
      </main>
    </div>
  );
}
