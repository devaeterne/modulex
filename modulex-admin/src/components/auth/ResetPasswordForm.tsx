"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

export default function ResetPasswordForm() {
  const router = useRouter();
  const [tokenHash, setTokenHash] = useState("");
  const [recoverySessionReady, setRecoverySessionReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let validationStarted = false;

    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const searchParams = new URLSearchParams(window.location.search);
    const token = hashParams.get("token_hash") || "";
    const type = hashParams.get("type") || "";
    const mode = searchParams.get("mode") || "";

    const clearCallbackUrl = () => {
      window.history.replaceState({}, "", window.location.pathname);
    };

    if (token && type === "recovery") {
      clearCallbackUrl();
      setTokenHash(token);
      setReady(true);
      return;
    }

    const isImplicitRecoveryCallback = mode === "recovery" || type === "recovery";

    if (!isImplicitRecoveryCallback) {
      setError("Open this page from a valid password reset email.");
      return;
    }

    async function validateImplicitRecovery() {
      if (cancelled || validationStarted) return;
      validationStarted = true;

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (cancelled) return;

      if (sessionError || !session) {
        validationStarted = false;
        clearCallbackUrl();
        setError("This password reset link is invalid or expired.");
        return;
      }

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (cancelled) return;

      if (userError || !user) {
        clearCallbackUrl();
        await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
        setError("This password reset link is invalid or expired.");
        return;
      }

      if (user.app_metadata?.account_type === "dealer_portal") {
        clearCallbackUrl();
        await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
        setError("This password reset link cannot be used here.");
        return;
      }

      clearCallbackUrl();
      setRecoverySessionReady(true);
      setReady(true);
      setError(null);
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" && session) {
        window.setTimeout(() => {
          void validateImplicitRecovery();
        }, 0);
      }
    });

    void validateImplicitRecovery();

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (!tokenHash && !recoverySessionReady) {
      setError("This password reset link is invalid or expired.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);
    let verifiedSession = recoverySessionReady;

    try {
      if (tokenHash) {
        const { data: verified, error: verifyError } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: "recovery",
        });

        if (verifyError || !verified.user) {
          throw new Error("This password reset link is invalid or expired.");
        }

        verifiedSession = true;

        if (verified.user.app_metadata?.account_type === "dealer_portal") {
          throw new Error("This password reset link cannot be used here.");
        }
      } else {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          throw new Error("This password reset link is invalid or expired.");
        }

        if (user.app_metadata?.account_type === "dealer_portal") {
          throw new Error("This password reset link cannot be used here.");
        }
      }

      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;

      setMessage("Password updated successfully. Redirecting to sign in...");
      await supabase.auth.signOut({ scope: "global" });
      router.replace("/signin");
    } catch (caught) {
      if (verifiedSession) {
        await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
      }
      setTokenHash("");
      setRecoverySessionReady(false);
      setReady(false);
      setError(caught instanceof Error ? caught.message : "Unable to update password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4 dark:bg-gray-950">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-7 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">
          Set new password
        </h1>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          Choose a new password for your Modulex account.
        </p>

        {error && (
          <div className="mt-6 rounded-lg border border-error-200 bg-error-50 p-4 text-sm text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-300">
            {error}
          </div>
        )}

        {message && (
          <div className="mt-6 rounded-lg border border-success-200 bg-success-50 p-4 text-sm text-success-700 dark:border-success-500/30 dark:bg-success-500/10 dark:text-success-400">
            {message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              New password
            </label>
            <input
              type="password"
              minLength={8}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-950 dark:text-white/90"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Confirm password
            </label>
            <input
              type="password"
              minLength={8}
              required
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-950 dark:text-white/90"
            />
          </div>

          <button
            type="submit"
            disabled={!ready || busy}
            className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Updating..." : "Update password"}
          </button>
        </form>
      </div>
    </div>
  );
}
