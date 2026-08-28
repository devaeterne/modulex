import Link from "next/link";
import { requireDealerPortalContext } from "@/lib/dealer/auth";
import { dealerLogoutAction } from "./actions";

export default async function DealerPortalLayout({ children }: { children: React.ReactNode }) {
  const context = await requireDealerPortalContext();

  return (
    <section className="min-vh-100 bg-light">
      <header className="border-bottom bg-white">
        <div className="container py-3 d-flex align-items-center justify-content-between gap-3">
          <div>
            <p className="text-uppercase small fw-semibold text-secondary mb-1">Dealer Portal</p>
            <div className="fw-semibold">{context.customer_name}</div>
            <div className="small text-secondary text-capitalize">{context.portal_role}</div>
          </div>
          <form action={dealerLogoutAction}>
            <button className="btn btn-outline-dark btn-sm" type="submit">Sign out</button>
          </form>
        </div>
      </header>

      <div className="container py-5">
        <div className="mb-4">
          <Link href="/dealer" className="text-decoration-none small text-secondary">Dealer home</Link>
        </div>
        {children}
      </div>
    </section>
  );
}
