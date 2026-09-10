"use client";

import { useEffect } from "react";

export const NOTIFICATION_READ_STORAGE_PREFIX = "modulex-notifications-read:";
export const NOTIFICATION_SYNC_CHANNEL = "modulex-notification-lifecycle";

export default function NotificationLifecycleBridge() {
  useEffect(() => {
    let channel: BroadcastChannel | null = null;
    let reloadScheduled = false;

    const reloadVisibleTab = () => {
      if (reloadScheduled || document.visibilityState !== "visible") return;
      reloadScheduled = true;
      window.setTimeout(() => window.location.reload(), 25);
    };

    const handleStorage = (event: StorageEvent) => {
      if (!event.key?.startsWith(NOTIFICATION_READ_STORAGE_PREFIX)) return;
      reloadVisibleTab();
    };

    window.addEventListener("storage", handleStorage);

    if ("BroadcastChannel" in window) {
      channel = new BroadcastChannel(NOTIFICATION_SYNC_CHANNEL);
      channel.onmessage = (event) => {
        if (event.data?.type === "notification-read-state-changed") {
          reloadVisibleTab();
        }
      };
    }

    return () => {
      window.removeEventListener("storage", handleStorage);
      channel?.close();
    };
  }, []);

  return null;
}
