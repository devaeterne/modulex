import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";

type PortalAuthShellProps = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

export default function PortalAuthShell({ title, subtitle, children, footer }: PortalAuthShellProps) {
  return (
    <main className="portal-auth-shell">
      <header className="portal-auth-shell__topbar">
        <Link href="/" className="portal-brand" aria-label="Oakwell Cabinetry home">
          <span className="portal-brand__mark">O</span>
          <span>Oakwell Cabinetry</span>
        </Link>
        <ThemeToggle />
      </header>

      <div className="portal-auth-shell__content">
        <section className="portal-auth-card" aria-labelledby="portal-auth-title">
          <p className="portal-kicker">Oakwell Account</p>
          <h1 id="portal-auth-title" className="portal-display-title">{title}</h1>
          {subtitle ? <p className="portal-muted portal-auth-card__subtitle">{subtitle}</p> : null}
          <div className="portal-auth-card__body">{children}</div>
          {footer ? <div className="portal-auth-card__footer">{footer}</div> : null}
        </section>
      </div>
    </main>
  );
}
