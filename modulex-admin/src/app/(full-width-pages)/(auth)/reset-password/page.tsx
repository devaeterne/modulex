import type { Metadata } from "next";
import ResetPasswordForm from "@/components/auth/ResetPasswordForm";

export const metadata: Metadata = {
  title: "Reset Password | Modulex Admin",
  description: "Set a new Modulex Admin password",
};

export default function ResetPasswordPage() {
  return <ResetPasswordForm />;
}
