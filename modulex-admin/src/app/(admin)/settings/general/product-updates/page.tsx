"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import ComponentCard from "@/components/common/ComponentCard";
import Label from "@/components/form/Label";
import Select from "@/components/form/Select";
import Input from "@/components/form/input/InputField";
import TextArea from "@/components/form/input/TextArea";
import Button from "@/components/ui/button/Button";
import { ADMIN_TEXT_STYLES } from "@/components/ui/theme/adminTheme";
import { isAdminRole } from "@/lib/auth/permissions";
import { getCurrentProfile, type UserRole } from "@/lib/supabase/profile";
import { supabase } from "@/lib/supabase/client";
import {
  SYSTEM_ANNOUNCEMENT_KIND_LABELS,
  SYSTEM_ANNOUNCEMENT_ROLES,
  validateSystemAnnouncementHref,
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

const KIND_OPTIONS = Object.entries(SYSTEM_ANNOUNCEMENT_KIND_LABELS).map(([value, label]) => ({ value, label }));

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
    const hrefValidation = validateSystemAnnouncementHref(href);
    if (hrefValidation.error) {
      setError(hrefValidation.error);
      return;
    }

    setSaving(true);
    setError(null);
    const now = publishNow ? new Date().toISOString() : null;
    const result = await supabase.from("system_announcements").insert({
      kind,
      title: title.trim(),
      message: message.trim(),
      href: hrefValidation.href,
      cta_label: ctaLabel.trim() || null,
      target_roles: targetRoles.length ? targetRoles : null,
      status: publishNow ? "published" : "draft",
      published_at: now,
      published_by: publishNow ? profile.id : null,
      created_by: profile.id,
    });
    if (result.error) setError(result.error.message);
    else {
      setTitle(""); setMessage(""); setHref(""); setCtaLabel(""); setTargetRoles([]); setKind("improvement");
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

  if (loading) return <div><PageBreadcrumb pageTitle="Product Updates" /><p className={`text-sm ${ADMIN_TEXT_STYLES.muted}`}>Loading product updates...</p></div>;
  if (!profile || !canManage) return <div><PageBreadcrumb pageTitle="Product Updates" /><ComponentCard title="Access restricted"><p className={`text-sm ${ADMIN_TEXT_STYLES.muted}`}>Only Admin and Super Admin users can publish system announcements.</p></ComponentCard></div>;

  return <div>
    <PageBreadcrumb pageTitle="Product Updates" />
    <div className="space-y-5">
      <ComponentCard title="System Announcements" desc="Publish Modulex feature announcements without creating one notification row per user.">
        <Link href="/updates" className={`text-sm font-medium ${ADMIN_TEXT_STYLES.body}`}>View What&apos;s New →</Link>
      </ComponentCard>

      {error ? <p role="alert" className={`text-sm ${ADMIN_TEXT_STYLES.body}`}>{error}</p> : null}

      <ComponentCard title="New announcement" desc="Leave Audience empty to publish to all users, or select one or more roles.">
        <form className="space-y-5" onSubmit={(event) => { event.preventDefault(); void createAnnouncement(false); }}>
          <div className="grid gap-4 lg:grid-cols-2">
            <div><Label htmlFor="announcement-kind">Type</Label><Select id="announcement-kind" value={kind} options={KIND_OPTIONS} onChange={(value) => setKind(value as SystemAnnouncementKind)} /></div>
            <div><Label htmlFor="announcement-title">Title</Label><Input id="announcement-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} required placeholder="Order screen updated" /></div>
          </div>
          <div><Label htmlFor="announcement-message">Message</Label><TextArea id="announcement-message" value={message} onChange={setMessage} maxLength={4000} required rows={4} placeholder="Historical Product can now be entered manually." /></div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div><Label htmlFor="announcement-href">Action URL</Label><Input id="announcement-href" value={href} onChange={(event) => setHref(event.target.value)} placeholder="/customers/orders" pattern="^/.*" hint="Internal Modulex path only, for example /customers/orders." /></div>
            <div><Label htmlFor="announcement-cta">Action label</Label><Input id="announcement-cta" value={ctaLabel} onChange={(event) => setCtaLabel(event.target.value)} maxLength={80} placeholder="Go to Orders" /></div>
          </div>
          <fieldset><legend className={`text-sm font-medium ${ADMIN_TEXT_STYLES.strong}`}>Audience</legend><p className={`mt-1 text-xs ${ADMIN_TEXT_STYLES.muted}`}>No role selected = all users.</p><div className="mt-3 flex flex-wrap gap-2">{SYSTEM_ANNOUNCEMENT_ROLES.map((role) => <Button key={role} type="button" size="sm" variant={targetRoles.includes(role) ? "primary" : "outline"} onClick={() => toggleRole(role)}>{ROLE_LABELS[role]}</Button>)}</div></fieldset>
          <div className="flex flex-wrap gap-3"><Button type="submit" variant="outline" disabled={saving}>Save Draft</Button><Button type="button" disabled={saving || !title.trim() || !message.trim()} onClick={() => void createAnnouncement(true)}>Publish Now</Button></div>
        </form>
      </ComponentCard>

      <ComponentCard title="Announcement history">
        <div className="space-y-5">{items.length === 0 ? <p className={`text-sm ${ADMIN_TEXT_STYLES.muted}`}>No announcements yet.</p> : items.map((item) => <article key={item.id}><p className={`text-xs font-semibold ${ADMIN_TEXT_STYLES.muted}`}>{SYSTEM_ANNOUNCEMENT_KIND_LABELS[item.kind]} · {item.status.toUpperCase()}</p><h3 className={`mt-2 font-semibold ${ADMIN_TEXT_STYLES.strong}`}>{item.title}</h3><p className={`mt-1 text-sm ${ADMIN_TEXT_STYLES.muted}`}>{item.message}</p><p className={`mt-2 text-xs ${ADMIN_TEXT_STYLES.muted}`}>Audience: {item.target_roles?.length ? item.target_roles.map((role) => ROLE_LABELS[role]).join(", ") : "All users"}</p><div className="mt-3 flex gap-2">{item.status === "draft" ? <Button size="sm" disabled={saving} onClick={() => void changeStatus(item, "published")}>Publish</Button> : null}{item.status === "published" ? <Button size="sm" variant="outline" disabled={saving} onClick={() => void changeStatus(item, "archived")}>Archive</Button> : null}</div></article>)}</div>
      </ComponentCard>
    </div>
  </div>;
}
