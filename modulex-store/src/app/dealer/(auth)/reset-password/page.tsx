import type { Metadata } from "next";
import Link from "next/link";
import PortalAuthShell from "@/components/portal/PortalAuthShell";
import DealerResetPasswordForm from "./DealerResetPasswordForm";

export const metadata: Metadata = { title: "Set Dealer Password", robots: { index: false, follow: false } };

export default function DealerResetPasswordPage() {
  return (
    <PortalAuthShell
      title="Choose a new password"
      subtitle="Complete the secure reset request to update your dealer account password."
      footer={<Link href="/dealer/login">Back to dealer sign in</Link>}
    >
      <DealerResetPasswordForm />
    </PortalAuthShell>
  );
}
