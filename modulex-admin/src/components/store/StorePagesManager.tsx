"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import StorePageEditor from "@/components/store/StorePageEditor";
import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";
import {
  CONTROLLED_PAGE_SLUGS,
  type ControlledPageSlug,
  type StorePage,
} from "@/lib/store/secondaryCms";

function defaultPageTitle(slug: ControlledPageSlug) {
  if (slug === "about") return "About Oakwell Cabinetry";
  if (slug === "showroom") return "Oakwell Cabinetry Showroom Information";
  if (slug === "cabinet-process") return "Cabinet Planning Process";
  return "Projects";
}

function emptyPage(slug: ControlledPageSlug): StorePage {
  return {
    id: null,
    slug,
    status: "draft",
    eyebrow: null,
    title: defaultPageTitle(slug),
    intro: null,
    body: null,
    hero_image_url: null,
    hero_image_alt: null,
    cta_label: null,
    cta_href: null,
    seo_title: null,
    seo_description: null,
    og_image_url: null,
    published_at: null,
    updated_at: null,
  };
}

export default function StorePagesManager() {
  const [pages, setPages] = useState<StorePage[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
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
    setCanEdit(["super_admin", "admin"].includes(profile?.role ?? ""));

    const { data, error: pagesError } = await supabase
      .from("store_pages")
      .select(
        "id,slug,status,eyebrow,title,intro,body,hero_image_url,hero_image_alt,cta_label,cta_href,seo_title,seo_description,og_image_url,published_at,updated_at"
      )
      .in("slug", CONTROLLED_PAGE_SLUGS);

    if (pagesError) {
      setError(pagesError.message);
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as StorePage[];
    setPages(
      CONTROLLED_PAGE_SLUGS.map((slug) => rows.find((row) => row.slug === slug) ?? emptyPage(slug))
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const orderedPages = useMemo(
    () => CONTROLLED_PAGE_SLUGS.map((slug) => pages.find((page) => page.slug === slug)).filter(Boolean) as StorePage[],
    [pages]
  );

  function handleSaved(saved: StorePage) {
    setPages((current) => current.map((page) => (page.slug === saved.slug ? saved : page));
  }

  if (loading) {
    return <div className="rounded-2xl border border-gray-200 bg-white p-8 text-sm text-gray-500 dark:border-gray-800 dark:bg-gray-900">Loading Store pages...</div>;
  }

  if (error && pages.length === 0) {
    return (
      <div className="rounded-2xl border border-error-200 bg-error-50 p-6 text-sm text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900 sm:p-6">
        <h1 className="text-xl font-semibold text-gray-800 dark:text-white/90">Secondary Store Pages</h1>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-gray-500 dark:text-gray-400">
          Manage the controlled About, Gallery, Showroom, and Cabinet Planning page records. Saving a draft never publishes content; publishing is an explicit action.
        </p>
        {error ? <p className="mt-3 text-sm text-error-600">{error}</p> : null}
      </section>

      {orderedPages.map((page) => (
        <StorePageEditor key={page.slug} page={page} canEdit={canEdit} onSaved={handleSaved} />
      ))}
    </div>
  );
}
