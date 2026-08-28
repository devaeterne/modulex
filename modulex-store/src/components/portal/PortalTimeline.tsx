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
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function PortalTimeline({ steps }: PortalTimelineProps) {
  return (
    <ol className="portal-timeline">
      {steps.map((step) => (
        <li
          key={step.label}
          className={`portal-timeline__step${step.complete ? " portal-timeline__step--complete" : ""}${step.current ? " portal-timeline__step--current" : ""}${step.exception ? " portal-timeline__step--exception" : ""}`}
        >
          <span className="portal-timeline__dot" aria-hidden="true" />
          <div>
            <strong>{step.label}</strong>
            {formatTimestamp(step.timestamp) ? <span className="portal-muted">{formatTimestamp(step.timestamp)}</span> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
