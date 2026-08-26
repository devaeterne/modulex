"use client";

import Link from "next/link";
import React, { FormEvent, useState } from "react";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import Button from "@/components/ui/button/Button";
import { requestPasswordReset } from "@/lib/supabase/auth";

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const cleanEmail = email.trim();

    if (!cleanEmail) {
      setErrorMessage("Please enter your email address.");
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const redirectTo = `${window.location.origin}/reset-password`;
    const { error } = await requestPasswordReset(cleanEmail, redirectTo);

    if (error) {
      setErrorMessage(error.message || "Password reset email could not be sent.");
      setIsLoading(false);
      return;
    }

    setSuccessMessage(
      "If an account exists for this email, a password reset link has been sent."
    );
    setIsLoading(false);
  }

  return (
    <div className="flex w-full flex-1 flex-col lg:w-1/2">
      <div className="mx-auto mb-5 w-full max-w-md sm:pt-10">
        <Link
          href="/signin"
          className="inline-flex items-center text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
        >
          ← Back to sign in
        </Link>
      </div>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center">
        <div>
          <div className="mb-5 sm:mb-8">
            <h1 className="mb-2 text-title-sm font-semibold text-gray-800 dark:text-white/90 sm:text-title-md">
              Forgot password
            </h1>
            <p className="text-sm leading-6 text-gray-500 dark:text-gray-400">
              Enter the email address associated with your Modulex account. We will send you a secure link to create a new password.
            </p>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="space-y-6">
              {errorMessage && (
                <div className="rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-600 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400">
                  {errorMessage}
                </div>
              )}

              {successMessage && (
                <div className="rounded-lg border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700 dark:border-success-500/30 dark:bg-success-500/10 dark:text-success-400">
                  {successMessage}
                </div>
              )}

              <div>
                <Label>
                  Email <span className="text-error-500">*</span>
                </Label>
                <Input
                  type="email"
                  placeholder="name@company.com"
                  defaultValue={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>

              <div>
                <Button className="w-full" size="sm" disabled={isLoading}>
                  {isLoading ? "Sending reset link..." : "Send reset link"}
                </Button>
              </div>
            </div>
          </form>

          <p className="mt-5 text-sm text-gray-500 dark:text-gray-400">
            Remembered your password?{" "}
            <Link
              href="/signin"
              className="font-medium text-brand-500 hover:text-brand-600 dark:text-brand-400"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
