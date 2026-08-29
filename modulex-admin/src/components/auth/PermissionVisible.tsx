"use client";

import { useEffect, useState, type ReactNode } from "react";
import { hasPermission, type Permission } from "@/lib/auth/permissions";
import { getCurrentProfile } from "@/lib/supabase/profile";

export default function PermissionVisible({
  permission,
  children,
}: {
  permission: Permission;
  children: ReactNode;
}) {
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function load() {
      const { profile } = await getCurrentProfile();
      if (mounted) {
        setAllowed(hasPermission(profile?.roles, permission));
      }
    }

    void load();
    return () => {
      mounted = false;
    };
  }, [permission]);

  if (!allowed) return null;
  return <>{children}</>;
}
