"use client";

import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase/client";

const PROCESS_INTERVAL_MS = 60_000;
const EMAIL_PUMP_LEASE_KEY = "modulex-email-notification-pump-lease";
const EMAIL_PUMP_LEASE_MS = 75_000;

type EmailPumpLease = {
  ownerId: string;
  expiresAt: number;
};

function readLease(): EmailPumpLease | null {
  try {
    const raw = window.localStorage.getItem(EMAIL_PUMP_LEASE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<EmailPumpLease>;
    if (typeof value.ownerId !== "string" || typeof value.expiresAt !== "number") return null;
    return { ownerId: value.ownerId, expiresAt: value.expiresAt };
  } catch {
    return null;
  }
}

function acquireLease(ownerId: string) {
  const now = Date.now();
  const current = readLease();
  if (current && current.ownerId !== ownerId && current.expiresAt > now) return false;

  try {
    window.localStorage.setItem(
      EMAIL_PUMP_LEASE_KEY,
      JSON.stringify({ ownerId, expiresAt: now + EMAIL_PUMP_LEASE_MS } satisfies EmailPumpLease)
    );
    return readLease()?.ownerId === ownerId;
  } catch {
    // Storage can be unavailable in hardened browsers. Falling back to the
    // per-component in-flight guard is still safe because queue rows are claimed atomically.
    return true;
  }
}

function releaseLease(ownerId: string) {
  try {
    if (readLease()?.ownerId === ownerId) {
      window.localStorage.removeItem(EMAIL_PUMP_LEASE_KEY);
    }
  } catch {
    // Non-critical cleanup.
  }
}

export default function EmailNotificationPump() {
  const running = useRef(false);

  useEffect(() => {
    let active = true;
    const ownerId = crypto.randomUUID();

    async function processQueue() {
      if (!active || running.current || document.visibilityState !== "visible") return;
      if (!acquireLease(ownerId)) return;

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

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void processQueue();
    };

    const startupTimer = window.setTimeout(() => void processQueue(), 2_000);
    const interval = window.setInterval(() => void processQueue(), PROCESS_INTERVAL_MS);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      active = false;
      window.clearTimeout(startupTimer);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      releaseLease(ownerId);
    };
  }, []);

  return null;
}
