type PortalPageHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
};

export default function PortalPageHeader({ eyebrow, title, description, actions }: PortalPageHeaderProps) {
  return (
    <header className="portal-page-header">
      <div>
        {eyebrow ? <p className="portal-kicker">{eyebrow}</p> : null}
        <h1 className="portal-display-title">{title}</h1>
        {description ? <p className="portal-muted portal-page-header__description">{description}</p> : null}
      </div>
      {actions ? <div className="portal-page-header__actions">{actions}</div> : null}
    </header>
  );
}
