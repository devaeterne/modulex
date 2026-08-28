type PortalEmptyStateProps = {
  title: string;
  description?: string;
};

export default function PortalEmptyState({ title, description }: PortalEmptyStateProps) {
  return (
    <div className="portal-empty-state" role="status">
      <span className="portal-empty-state__icon" aria-hidden="true">◇</span>
      <h2>{title}</h2>
      {description ? <p className="portal-muted">{description}</p> : null}
    </div>
  );
}
