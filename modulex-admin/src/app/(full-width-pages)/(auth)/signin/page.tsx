// src/app/(full-width-pages)/(auth)/signin/page.tsx

import SignInForm from "@/components/auth/SignInForm";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In | Modulex Admin",
  description: "Modulex ERP admin panel sign-in page",
};

export default function SignIn() {
  return <SignInForm />;
}