"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

export default function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setReady(Boolean(data.session));
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) {
        setReady(true);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);

    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError(updateError.message);
      setBusy(false);
      return;
    }

    setMessage("Password updated successfully. Redirecting to sign in...");
    await supabase.auth.signOut();
    router.replace("/signin");
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

        {!ready && (
          <div className="mt-6 rounded-lg border border-warning-200 bg-warning-50 p-4 text-sm text-warning-700 dark:border-warning-500/30 dark:bg-warning-500/10 dark:text-warning-300">
            Open this page from a valid invitation or password reset email.
          </div>
        )}

        {error && (
          <div className="mt-6 rounded-lg border border-error-200 bg-error-50 p-4 text-sm text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-300">
            {error}
          </div>
        )}

        {message && (
          <div className="mt-6 rounded-lg border border-success-200 bg-success-50 p-4 text-sm text-success-700 dark:border-success-500/30 dark:bg-success-500/10 dark:text-success-300">
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
