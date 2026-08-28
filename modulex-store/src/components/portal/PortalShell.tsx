import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";
import PortalNavigation from "@/components/portal/PortalNavigation";

type PortalShellProps = {
  kind: "customer" | "dealer";
  companyName: string;
  portalRole: string;
  signOutAction: () => void | Promise<void>;
  children: React.ReactNode;
};

export default function PortalShell({ kind, companyName, portalRole, signOutAction, children }: PortalShellProps) {
  const label = kind === "dealer" ? "Dealer Portal" : "Customer Portal";

  return (
    <div className="portal-shell">
      <header className="portal-shell__header">
        <div className="portal-shell__header-inner">
          <Link href="/" className="portal-brand" aria-label="Oakwell Cabinetry home">
            <span className="portal-brand__mark">O</span>
            <span>Oakwell Cabinetry</span>
          </Link>

          <div className="portal-shell__account">
            <div className="portal-shell__identity">
              <span className="portal-kicker">{label}</span>
              <strong>{companyName}</strong>
              <span className="portal-muted text-capitalize">{portalRole.replaceAll("_", " ")}</span>
            </div>
            <ThemeToggle />
            <form action={signOutAction}>
              <button type="submit" className="portal-button portal-button--secondary">Sign out</button>
            </form>
          </div>
        </div>
      </header>

      <div className="portal-shell__body">
        <aside className="portal-shell__sidebar">
          <PortalNavigation kind={kind} />
        </aside>
        <main className="portal-shell__main">{children}</main>
      </div>
    </div>
  );
}
