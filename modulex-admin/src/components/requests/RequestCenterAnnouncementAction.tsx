"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/button/Button";
import { getCurrentProfile } from "@/lib/supabase/profile";

export default function RequestCenterAnnouncementAction() {
  const router = useRouter();
  const [canPublish, setCanPublish] = useState(false);

  useEffect(() => {
    let active = true;

    void getCurrentProfile().then(({ profile }) => {
      if (!active) return;
      setCanPublish(
        Boolean(
          profile?.roles.some(
            (role) => role === "admin" || role === "super_admin"
          )
        )
      );
    });

    return () => {
      active = false;
    };
  }, []);

  if (!canPublish) return null;

  return (
    <div className="mb-4 flex justify-end">
      <Button
        variant="outline"
        onClick={() => router.push("/settings/general/product-updates")}
      >
        Publish product update
      </Button>
    </div>
  );
}
