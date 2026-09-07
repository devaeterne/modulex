"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { isAdminRole } from "@/lib/auth/permissions";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { supabase } from "@/lib/supabase/client";
import {
  SYSTEM_ANNOUNCEMENT_KIND_LABELS,
  type SystemAnnouncement,
} from "@/lib/system-announcements";

function formatDate(value: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric" }).format(new Date(value));
}

export default function UpdatesPage() {
  const [items, setItems] = useState<SystemAnnouncement[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const current = await getCurrentProfile();
      if (!mounted || !current.profile) return;
      setCanManage(isAdminRole(current.profile.role));
      const result = await supabase
        .from("system_announcements")
        .select("id,kind,title,message,href,cta_label,target_roles,status,published_at,created_by,published_by,created_at,updated_at")
        .eq("status", "published")
        .lte("published_at", new Date().toISOString())
        .order("published_at", { ascending: false });
      if (!mounted) return;
      if (result.error) setError(result.error.message);
      else setItems((result.data as SystemAnnouncement[] | null) ?? []);
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, []);

  return <div className="mx-auto max-w-4xl space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-xs font-semibold uppercase tracking-wider text-brand-500">Modulex</p><h1 className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">What&apos;s New</h1><p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Product improvements, new features, fixes and maintenance notices.</p></div>
      {canManage && <Link href="/settings/general/product-updates" className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white">Manage Updates</Link>}
    </div>

    {error && <div className="rounded-xl border border-error-200 bg-error-50 p-3 text-sm text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-300">{error}</div>}
    {loading ? <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 dark:border-gray-800 dark:bg-gray-900">Loading updates...</div> : items.length === 0 ? <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 dark:border-gray-800 dark:bg-gray-900">No published updates yet.</div> : <div className="space-y-4">{items.map((item) => <article key={item.id} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">{SYSTEM_ANNOUNCEMENT_KIND_LABELS[item.kind]}</span><time className="text-xs text-gray-400">{formatDate(item.published_at)}</time></div><h2 className="mt-3 text-lg font-semibold text-gray-900 dark:text-white">{item.title}</h2><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-600 dark:text-gray-300">{item.message}</p>{item.href && <Link href={item.href} className="mt-4 inline-flex text-sm font-semibold text-brand-500 hover:text-brand-600">{item.cta_label || "Open"} →</Link>}</article>)}</div>}
  </div>;
}
