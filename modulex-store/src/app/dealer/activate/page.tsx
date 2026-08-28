import type { Metadata } from "next";
import Link from "next/link";
import PortalAuthShell from "@/components/portal/PortalAuthShell";
import DealerActivationForm from "./DealerActivationForm";

export const metadata: Metadata = {
  title: "Activate Dealer Account",
  description: "Complete your Oakwell Cabinetry dealer portal account setup.",
  robots: { index: false, follow: false },
};

export default function DealerActivatePage() {
  return (
    <PortalAuthShell
      title="Activate dealer account"
      subtitle="Choose a password to complete your Oakwell dealer invitation."
      footer={<Link href="/dealer/login">Back to dealer sign in</Link>}
    >
      <DealerActivationForm />
    </PortalAuthShell>
  );
}
