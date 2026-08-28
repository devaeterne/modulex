type PortalStatusBadgeProps = {
  status: string;
};

const exceptionStates = new Set(["cancelled", "suspended", "blocked"]);
const successStates = new Set(["delivered", "completed", "active"]);
const activeStates = new Set(["confirmed", "shipped", "in_progress", "packed", "picking"]);

export default function PortalStatusBadge({ status }: PortalStatusBadgeProps) {
  const normalized = status.toLowerCase();
  const tone = exceptionStates.has(normalized)
    ? "danger"
    : successStates.has(normalized)
      ? "success"
      : activeStates.has(normalized)
        ? "accent"
        : "neutral";
  const label = status.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());

  return <span className={`portal-status portal-status--${tone}`}>{label}</span>;
}
