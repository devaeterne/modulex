"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

export default function DealerForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) { setError("Enter your email address."); return; }
    setBusy(true); setError(null); setMessage(null);
    try {
      const supabase = createBrowserSupabaseClient();
      const redirectTo = `${window.location.origin}/dealer/reset-password`;
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(cleanEmail, { redirectTo });
      if (resetError) { setError("Password reset is temporarily unavailable. Please try again."); return; }
      setMessage("If an eligible account exists for this email, a password reset link has been sent.");
    } catch {
      setError("Password reset is temporarily unavailable. Please try again.");
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={handleSubmit} className="portal-form">
      {error ? <div className="portal-alert portal-alert--error" role="alert">{error}</div> : null}
      {message ? <div className="portal-alert portal-alert--success" role="status">{message}</div> : null}
      <div className="portal-field">
        <label className="portal-label" htmlFor="dealer-reset-email">Email</label>
        <input id="dealer-reset-email" className="portal-input" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} disabled={busy} required />
      </div>
      <button className="portal-button portal-button--primary portal-button--full" type="submit" disabled={busy}>{busy ? "Sending…" : "Send reset link"}</button>
      <div className="portal-form__footer"><Link href="/dealer/login" className="portal-link">Back to sign in</Link></div>
    </form>
  );
}
