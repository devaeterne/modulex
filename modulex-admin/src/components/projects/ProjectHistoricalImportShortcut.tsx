"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { hasPermission } from "@/lib/auth/permissions";
import { getCurrentProfile } from "@/lib/supabase/profile";

export default function ProjectHistoricalImportShortcut() {
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let active = true;
    void getCurrentProfile().then(({ profile }) => {
      if (active) setAllowed(Boolean(profile && hasPermission(profile.roles, "projects.import")));
    });
    return () => {
      active = false;
    };
  }, []);

  if (!allowed) return null;

  return (
    <div className="mb-5 flex justify-end">
      <Link
        href="/projects/import"
        className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 shadow-theme-xs transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-white/[0.05]"
      >
        Historical Import
      </Link>
    </div>
  );
}
