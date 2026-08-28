"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  pushAnalyticsEvent,
  type StoreAnalyticsEventName,
  type StoreAnalyticsPayload,
} from "@/lib/analytics/events";

type Props = {
  href: string;
  className?: string;
  children: ReactNode;
  event: StoreAnalyticsEventName;
  payload?: StoreAnalyticsPayload;
  target?: string;
  rel?: string;
};

export default function TrackedLink({
  href,
  className,
  children,
  event,
  payload,
  target,
  rel,
}: Props) {
  const onClick = () => pushAnalyticsEvent(event, payload);

  if (target || /^https?:\/\//i.test(href)) {
    return (
      <a href={href} className={className} target={target} rel={rel} onClick={onClick}>
        {children}
      </a>
    );
  }

  return (
    <Link href={href} className={className} onClick={onClick}>
      {children}
    </Link>
  );
}
