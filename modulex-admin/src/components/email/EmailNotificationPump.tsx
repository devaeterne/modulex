"use client";

import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase/client";

const PROCESS_INTERVAL_MS = 20_000;

export default function EmailNotificationPump() {
  const running = useRef(false);

  useEffect(() => {
    let active = true;

    async function processQueue() {
      if (!active || running.current) return;
      running.current = true;

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.access_token) return;

        await fetch("/api/admin/email-notifications/process", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ limit: 20 }),
          cache: "no-store",
        });
      } catch (error) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("Email notification processing failed:", error);
        }
      } finally {
        running.current = false;
      }
    }

    const startupTimer = window.setTimeout(() => void processQueue(), 2_000);
    const interval = window.setInterval(() => void processQueue(), PROCESS_INTERVAL_MS);

    return () => {
      active = false;
      window.clearTimeout(startupTimer);
      window.clearInterval(interval);
    };
  }, []);

  return null;
}
