"use client";

import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import Button from "@/components/ui/button/Button";
import { EyeCloseIcon, EyeIcon } from "@/icons";
import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { FormEvent, useState } from "react";
import { signInWithEmail } from "@/lib/supabase/auth";
import { getCurrentProfile } from "@/lib/supabase/profile";

export default function SignInForm() {
  const router = useRouter();

  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setIsLoading(true);
    setErrorMessage(null);

    const { error } = await signInWithEmail(email.trim(), password);

    if (error) {
      setErrorMessage(error.message || "Unable to sign in. Please try again.");
      setIsLoading(false);
      return;
    }

    const { profile, error: profileError } = await getCurrentProfile();

    if (profileError || !profile) {
      setErrorMessage("Your profile could not be loaded. Please contact an administrator.");
      setIsLoading(false);
      return;
    }

    if (!profile.is_active) {
      setErrorMessage("Your account is inactive. Please contact an administrator.");
      setIsLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex flex-col flex-1 lg:w-1/2 w-full">
      <div className="w-full max-w-md sm:pt-10 mx-auto mb-5">
        <Link
          href="/"
          className="inline-flex items-center text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
        >
          Modulex Admin
        </Link>
      </div>

      <div className="flex flex-col justify-center flex-1 w-full max-w-md mx-auto">
        <div>
          <div className="mb-5 sm:mb-8">
            <h1 className="mb-2 font-semibold text-gray-800 text-title-sm dark:text-white/90 sm:text-title-md">
              Sign In
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Enter your email and password to access Modulex Admin.
            </p>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="space-y-6">
              {errorMessage && (
                <div className="rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-600 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400">
                  {errorMessage}
                </div>
              )}

              <div>
                <Label>
                  Email <span className="text-error-500">*</span>
                </Label>
                <Input
                  placeholder="name@company.com"
                  type="email"
                  defaultValue={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between gap-3">
                  <Label>
                    Password <span className="text-error-500">*</span>
                  </Label>

                  <Link
                    href="/forgot-password"
                    className="shrink-0 text-sm font-medium text-brand-500 transition hover:text-brand-600 dark:text-brand-400"
                  >
                    Forgot password?
                  </Link>
                </div>

                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    defaultValue={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />

                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    className="absolute right-4 top-1/2 z-30 -translate-y-1/2 text-gray-500 dark:text-gray-400"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <EyeIcon className="fill-current" />
                    ) : (
                      <EyeCloseIcon className="fill-current" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <Button
                  type="submit"
                  className="w-full"
                  size="sm"
                  disabled={isLoading}
                >
                  {isLoading ? "Signing in..." : "Sign In"}
                </Button>
              </div>
            </div>
          </form>

          <div className="mt-5">
            <p className="text-sm font-normal text-center text-gray-500 dark:text-gray-400 sm:text-start">
              Access is restricted to authorized Modulex users.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
