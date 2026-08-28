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
    if (sent.current) return;
    sent.current = true;
    pushAnalyticsEvent(event, payload);
  }, [event, payload]);

  return null;
}
