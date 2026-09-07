"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { isAdminRole } from "@/lib/auth/permissions";
import { getCurrentProfile, type UserRole } from "@/lib/supabase/profile";
import { supabase } from "@/lib/supabase/client";
import {
  SYSTEM_ANNOUNCEMENT_KIND_LABELS,
  SYSTEM_ANNOUNCEMENT_ROLES,
  type SystemAnnouncement,
  type SystemAnnouncementKind,
} from "@/lib/system-announcements";

const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  sales: "Sales",
  finance: "Finance",
  hr: "HR",
  warehouse: "Warehouse",
  shipping: "Shipping",
};

export default function ProductUpdatesAdminPage() {
  const [profile, setProfile] = useState<Awaited<ReturnType<typeof getCurrentProfile>>["profile"] | null>(null);
  const [items, setItems] = useState<SystemAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [kind, setKind] = useState<SystemAnnouncementKind>("improvement");
  const [href, setHref] = useState("");
  const [ctaLabel, setCtaLabel] = useState("");
  const [targetRoles, setTargetRoles] = useState<UserRole[]>([]);

  const canManage = useMemo(() => isAdminRole(profile?.role), [profile]);

  async function load() {
    const result = await supabase
      .from("system_announcements")
      .select("id,kind,title,message,href,cta_label,target_roles,status,published_at,created_by,published_by,created_at,updated_at")
      .order("created_at", { ascending: false });
    if (result.error) setError(result.error.message);
    else setItems((result.data as SystemAnnouncement[] | null) ?? []);
  }

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const current = await getCurrentProfile();
      if (!mounted) return;
      setProfile(current.profile);
      if (current.profile && isAdminRole(current.profile.role)) await load();
      if (mounted) setLoading(false);
    })();
    return () => { mounted = false; };
  }, []);

  function toggleRole(role: UserRole) {
    setTargetRoles((current) => current.includes(role) ? current.filter((item) => item !== role) : [...current, role]);
  }

  async function createAnnouncement(publishNow: boolean) {
    if (!profile || !canManage || !title.trim() || !message.trim()) return;
    setSaving(true);
    setError(null);
    const now = publishNow ? new Date().toISOString() : null;
    const result = await supabase.from("system_announcements").insert({
      kind,
      title: title.trim(),
      message: message.trim(),
      href: href.trim() || null,
      cta_label: ctaLabel.trim() || null,
      target_roles: targetRoles.length ? targetRoles : null,
      status: publishNow ? "published" : "draft",
      published_at: now,
      published_by: publishNow ? profile.id : null,
      created_by: profile.id,
    });
    if (result.error) setError(result.error.message);
    else {
      setTitle("");
      setMessage("");
      setHref("");
      setCtaLabel("");
      setTargetRoles([]);
      setKind("improvement");
      await load();
    }
    setSaving(false);
  }

  async function changeStatus(item: SystemAnnouncement, status: "published" | "archived") {
    if (!profile || !canManage) return;
    setSaving(true);
    setError(null);
    const result = await supabase.from("system_announcements").update({
      status,
      updated_at: new Date().toISOString(),
      published_at: status === "published" ? (item.published_at ?? new Date().toISOString()) : item.published_at,
      published_by: status === "published" ? profile.id : item.published_by,
    }).eq("id", item.id);
    if (result.error) setError(result.error.message);
    else await load();
    setSaving(false);
  }

  if (loading) return <div className="p-6 text-sm text-gray-500">Loading product updates...</div>;
  if (!profile || !canManage) return <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900"><h1 className="text-xl font-semibold text-gray-900 dark:text-white">Product Updates</h1><p className="mt-2 text-sm text-gray-500">Only Admin and Super Admin users can publish system announcements.</p></div>;

  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-xs font-semibold uppercase tracking-wider text-brand-500">System</p><h1 className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">Product Updates</h1><p className="mt-2 max-w-2xl text-sm text-gray-500 dark:text-gray-400">Publish Modulex feature announcements without creating one notification row per user.</p></div>
      <Link href="/updates" className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300">View What&apos;s New</Link>
    </div>

    {error && <div className="rounded-xl border border-error-200 bg-error-50 p-3 text-sm text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-300">{error}</div>}

    <form className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900" onSubmit={(event) => { event.preventDefault(); void createAnnouncement(false); }}>
      <div className="grid gap-4 lg:grid-cols-2">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Type<select value={kind} onChange={(event) => setKind(event.target.value as SystemAnnouncementKind)} className="mt-2 w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2.5 dark:border-gray-700">{Object.entries(SYSTEM_ANNOUNCEMENT_KIND_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Title<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} required placeholder="Order screen updated" className="mt-2 w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2.5 dark:border-gray-700" /></label>
      </div>
      <label className="mt-4 block text-sm font-medium text-gray-700 dark:text-gray-300">Message<textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={4000} required rows={4} placeholder="Historical Product can now be entered manually." className="mt-2 w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2.5 dark:border-gray-700" /></label>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Action URL<input value={href} onChange={(event) => setHref(event.target.value)} placeholder="/customers/orders" pattern="^/.*" className="mt-2 w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2.5 dark:border-gray-700" /></label>
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Action label<input value={ctaLabel} onChange={(event) => setCtaLabel(event.target.value)} maxLength={80} placeholder="Go to Orders" className="mt-2 w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2.5 dark:border-gray-700" /></label>
      </div>
      <fieldset className="mt-5"><legend className="text-sm font-medium text-gray-700 dark:text-gray-300">Audience</legend><p className="mt-1 text-xs text-gray-500">No role selected = all users.</p><div className="mt-3 flex flex-wrap gap-2">{SYSTEM_ANNOUNCEMENT_ROLES.map((role) => <button key={role} type="button" onClick={() => toggleRole(role)} className={`rounded-full border px-3 py-1.5 text-xs font-medium ${targetRoles.includes(role) ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/10" : "border-gray-200 text-gray-600 dark:border-gray-700 dark:text-gray-300"}`}>{ROLE_LABELS[role]}</button>)}</div></fieldset>
      <div className="mt-6 flex flex-wrap gap-3"><button type="submit" disabled={saving} className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300">Save Draft</button><button type="button" disabled={saving || !title.trim() || !message.trim()} onClick={() => void createAnnouncement(true)} className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">Publish Now</button></div>
    </form>

    <section className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900"><div className="border-b border-gray-100 px-5 py-4 dark:border-gray-800"><h2 className="font-semibold text-gray-900 dark:text-white">Announcement history</h2></div><div className="divide-y divide-gray-100 dark:divide-gray-800">{items.length === 0 ? <p className="p-5 text-sm text-gray-500">No announcements yet.</p> : items.map((item) => <article key={item.id} className="p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-brand-50 px-2 py-1 text-[11px] font-semibold text-brand-700 dark:bg-brand-500/10">{SYSTEM_ANNOUNCEMENT_KIND_LABELS[item.kind]}</span><span className="rounded-full bg-gray-100 px-2 py-1 text-[11px] font-semibold uppercase text-gray-600 dark:bg-gray-800 dark:text-gray-300">{item.status}</span></div><h3 className="mt-2 font-semibold text-gray-900 dark:text-white">{item.title}</h3><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{item.message}</p><p className="mt-2 text-xs text-gray-400">Audience: {item.target_roles?.length ? item.target_roles.map((role) => ROLE_LABELS[role]).join(", ") : "All users"}</p></div><div className="flex gap-2">{item.status === "draft" && <button disabled={saving} onClick={() => void changeStatus(item, "published")} className="rounded-lg bg-brand-500 px-3 py-2 text-xs font-medium text-white">Publish</button>}{item.status === "published" && <button disabled={saving} onClick={() => void changeStatus(item, "archived")} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 dark:border-gray-700 dark:text-gray-300">Archive</button>}</div></div></article>)}</div></section>
  </div>;
}
