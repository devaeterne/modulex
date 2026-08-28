"use client";

import { useEffect, useRef } from "react";
import {
  pushAnalyticsEvent,
  type StoreAnalyticsEventName,
  type StoreAnalyticsPayload,
} from "@/lib/analytics/events";

export default function AnalyticsEventOnView({
  event,
  payload,
}: {
  event: StoreAnalyticsEventName;
  payload?: StoreAnalyticsPayload;
}) {
  const sent = useRef(false);

  useEffect(() => {
    const trySend = () => {
      if (sent.current) return;
      if (pushAnalyticsEvent(event, payload)) {
        sent.current = true;
        window.removeEventListener("oakwell:consent-changed", trySend);
      }
    };

    trySend();
    if (!sent.current) window.addEventListener("oakwell:consent-changed", trySend);
    return () => window.removeEventListener("oakwell:consent-changed", trySend);
  }, [event, payload]);

  return null;
}
