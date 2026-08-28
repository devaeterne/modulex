import type { Metadata } from "next";
import Link from "next/link";
import PortalAuthShell from "@/components/portal/PortalAuthShell";
import AccountForgotPasswordForm from "./AccountForgotPasswordForm";

export const metadata: Metadata = { title: "Reset Account Password", robots: { index: false, follow: false } };

export default function AccountForgotPasswordPage() {
  return (
    <PortalAuthShell
      title="Reset password"
      subtitle="Enter your account email. If it is eligible, we will send a secure reset link."
      footer={<Link href="/account/login">Back to sign in</Link>}
    >
      <AccountForgotPasswordForm />
    </PortalAuthShell>
  );
}
