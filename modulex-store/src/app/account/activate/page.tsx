import type { Metadata } from "next";
import Link from "next/link";
import PortalAuthShell from "@/components/portal/PortalAuthShell";
import AccountActivationForm from "./AccountActivationForm";

export const metadata: Metadata = { title: "Activate Account", robots: { index: false, follow: false } };

export default function AccountActivationPage() {
  return (
    <PortalAuthShell
      title="Activate account"
      subtitle="Choose a password to complete your secure Oakwell account activation."
      footer={<Link href="/account/login">Back to sign in</Link>}
    >
      <AccountActivationForm />
    </PortalAuthShell>
  );
}
