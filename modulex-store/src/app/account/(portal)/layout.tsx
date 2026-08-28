import PortalShell from "@/components/portal/PortalShell";
import { requireCustomerPortalContext } from "@/lib/portal/auth";
import { accountLogoutAction } from "./actions";

export default async function AccountPortalLayout({ children }: { children: React.ReactNode }) {
  const context = await requireCustomerPortalContext();

  return (
    <PortalShell
      kind="customer"
      companyName={context.customer_name}
      portalRole={context.portal_role}
      signOutAction={accountLogoutAction}
    >
      {children}
    </PortalShell>
  );
}
