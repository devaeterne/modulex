import PortalShell from "@/components/portal/PortalShell";
import { requireDealerPortalContext } from "@/lib/dealer/auth";
import { dealerLogoutAction } from "./actions";

export default async function DealerPortalLayout({ children }: { children: React.ReactNode }) {
  const context = await requireDealerPortalContext();

  return (
    <PortalShell
      kind="dealer"
      companyName={context.customer_name}
      portalRole={context.portal_role}
      signOutAction={dealerLogoutAction}
    >
      {children}
    </PortalShell>
  );
}
