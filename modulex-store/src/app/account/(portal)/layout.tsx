import Link from "next/link";
import { requireCustomerPortalContext } from "@/lib/portal/auth";
import { accountLogoutAction } from "./actions";

export default async function AccountPortalLayout({ children }: { children: React.ReactNode }) {
  const context = await requireCustomerPortalContext();
  return (
    <section className="min-vh-100 bg-light">
      <header className="border-bottom bg-white">
        <div className="container py-3 d-flex align-items-center justify-content-between gap-3">
          <div>
            <p className="text-uppercase small fw-semibold text-secondary mb-1">Customer Portal</p>
            <div className="fw-semibold">{context.customer_name}</div>
            <div className="small text-secondary text-capitalize">{context.portal_role}</div>
          </div>
          <form action={accountLogoutAction}><button className="btn btn-outline-dark btn-sm" type="submit">Sign out</button></form>
        </div>
      </header>
      <div className="container py-5">
        <nav className="d-flex gap-3 mb-4">
          <Link href="/account" className="text-decoration-none small text-secondary">Account home</Link>
          <Link href="/account/orders" className="text-decoration-none small text-secondary">Orders</Link>
        </nav>
        {children}
      </div>
    </section>
  );
}
