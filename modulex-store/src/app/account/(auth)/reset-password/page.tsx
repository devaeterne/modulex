import type { Metadata } from "next";
import Link from "next/link";
import PortalAuthShell from "@/components/portal/PortalAuthShell";
import AccountResetPasswordForm from "./AccountResetPasswordForm";

export const metadata: Metadata = { title: "Set Account Password", robots: { index: false, follow: false } };

export default function AccountResetPasswordPage() {
  return (
    <PortalAuthShell
      title="Set a new password"
      subtitle="Choose a new password for your secure Oakwell account."
      footer={<Link href="/account/login">Back to sign in</Link>}
    >
      <AccountResetPasswordForm />
    </PortalAuthShell>
  );
}
