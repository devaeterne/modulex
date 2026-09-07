"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import ComponentCard from "@/components/common/ComponentCard";
import { ADMIN_TEXT_STYLES } from "@/components/ui/theme/adminTheme";
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

  return <div>
    <PageBreadcrumb pageTitle="What's New" />
    <div className="space-y-5">
      <ComponentCard title="Modulex Product Updates" desc="Product improvements, new features, fixes and maintenance notices.">
        {canManage ? <Link href="/settings/general/product-updates" className={`text-sm font-medium ${ADMIN_TEXT_STYLES.body}`}>Manage Updates →</Link> : null}
      </ComponentCard>

      {error ? <p role="alert" className={`text-sm ${ADMIN_TEXT_STYLES.body}`}>{error}</p> : null}
      {loading ? <ComponentCard title="Updates"><p className={`text-sm ${ADMIN_TEXT_STYLES.muted}`}>Loading updates...</p></ComponentCard> : null}
      {!loading && items.length === 0 ? <ComponentCard title="Updates"><p className={`text-sm ${ADMIN_TEXT_STYLES.muted}`}>No published updates yet.</p></ComponentCard> : null}

      {!loading ? items.map((item) => <ComponentCard key={item.id} title={item.title} desc={`${SYSTEM_ANNOUNCEMENT_KIND_LABELS[item.kind]} · ${formatDate(item.published_at)}`}><p className={`whitespace-pre-wrap text-sm leading-6 ${ADMIN_TEXT_STYLES.body}`}>{item.message}</p>{item.href ? <Link href={item.href} className={`mt-4 inline-flex text-sm font-semibold ${ADMIN_TEXT_STYLES.body}`}>{item.cta_label || "Open"} →</Link> : null}</ComponentCard>) : null}
    </div>
  </div>;
}
