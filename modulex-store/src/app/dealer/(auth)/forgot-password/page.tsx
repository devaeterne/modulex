import type { Metadata } from "next";
import Link from "next/link";
import PortalAuthShell from "@/components/portal/PortalAuthShell";
import DealerForgotPasswordForm from "./DealerForgotPasswordForm";

export const metadata: Metadata = { title: "Dealer Password Reset", robots: { index: false, follow: false } };

export default function DealerForgotPasswordPage() {
  return (
    <PortalAuthShell
      title="Reset dealer password"
      subtitle="Enter your dealer account email. If the account is eligible, we will send a secure reset link."
      footer={<Link href="/dealer/login">Back to dealer sign in</Link>}
    >
      <DealerForgotPasswordForm />
    </PortalAuthShell>
  );
}
