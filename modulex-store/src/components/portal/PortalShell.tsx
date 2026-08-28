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
      <div className="portal-shell__body">
        <aside className="portal-shell__sidebar">
          <div className="portal-shell__sidebar-account portal-panel p-3 mb-3">
            <div className="portal-shell__identity text-start">
              <span className="portal-kicker">{label}</span>
              <strong>{companyName}</strong>
              <span className="portal-muted text-capitalize">{portalRole.replaceAll("_", " ")}</span>
            </div>
            <div className="portal-shell__account mt-3">
              <ThemeToggle />
              <form action={signOutAction}>
                <button type="submit" className="portal-button portal-button--secondary">Sign out</button>
              </form>
            </div>
          </div>
          <PortalNavigation kind={kind} />
        </aside>
        <main className="portal-shell__main">{children}</main>
      </div>
    </div>
  );
}
