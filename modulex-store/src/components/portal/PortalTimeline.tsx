import { formatDateTime } from "@/lib/dates/usDate";

export type PortalTimelineStep = {
  label: string;
  timestamp?: string | null;
  complete?: boolean;
  current?: boolean;
  exception?: boolean;
};

type PortalTimelineProps = {
  steps: PortalTimelineStep[];
};

function formatTimestamp(value: string | null | undefined) {
  if (!value) return null;
  const formatted = formatDateTime(value);
  return formatted === "—" ? null : formatted;
}

export default function PortalTimeline({ steps }: PortalTimelineProps) {
  return (
    <ol className="portal-timeline">
      {steps.map((step) => {
        const timestamp = formatTimestamp(step.timestamp);
        return (
          <li
            key={step.label}
            className={`portal-timeline__step${step.complete ? " portal-timeline__step--complete" : ""}${step.current ? " portal-timeline__step--current" : ""}${step.exception ? " portal-timeline__step--exception" : ""}`}
          >
            <span className="portal-timeline__dot" aria-hidden="true" />
            <div>
              <strong>{step.label}</strong>
              {timestamp ? <span className="portal-muted">{timestamp}</span> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
