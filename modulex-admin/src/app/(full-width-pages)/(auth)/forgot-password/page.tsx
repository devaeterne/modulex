import ForgotPasswordForm from "@/components/auth/ForgotPasswordForm";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Forgot Password | Modulex Admin",
  description: "Request a password reset link for your Modulex Admin account",
};

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
