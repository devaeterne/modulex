"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Button from "@/components/ui/button/Button";
import { hasPermission } from "@/lib/auth/permissions";
import { getCurrentProfile } from "@/lib/supabase/profile";

export default function ProjectHistoricalImportShortcut() {
  const router = useRouter();
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
      <Button variant="outline" size="sm" onClick={() => router.push("/projects/import")}>
        Historical Import
      </Button>
    </div>
  );
}
