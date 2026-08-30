"use client";

import { useEffect, useState } from "react";
import StoreChromeSettings from "@/components/store/StoreChromeSettings";
import StoreLegacyContentSettings from "@/components/store/StoreLegacyContentSettings";
import { getCurrentProfile } from "@/lib/supabase/profile";

export default function StoreContentSettings() {
  const [canEdit, setCanEdit] = useState(false);

  useEffect(() => {
    let active = true;

    void getCurrentProfile().then(({ profile }) => {
      if (!active) return;
      setCanEdit(["super_admin", "admin"].includes(profile?.role ?? ""));
    });

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-5">
      <StoreLegacyContentSettings />
      <StoreChromeSettings canEdit={canEdit} />
    </div>
  );
}
