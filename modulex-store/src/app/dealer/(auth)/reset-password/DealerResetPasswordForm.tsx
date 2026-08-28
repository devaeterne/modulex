"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

type ResetState = "loading" | "ready" | "submitting" | "error";

export default function DealerResetPasswordForm() {
  const [state, setState] = useState<ResetState>("loading");
  const [tokenHash, setTokenHash] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const token = params.get("token_hash") || "";
    const type = params.get("type") || "";
    window.history.replaceState({}, "", window.location.pathname);
    if (!token || type !== "recovery") { setMessage("This password reset link is invalid or expired."); setState("error"); return; }
    setTokenHash(token); setState("ready");
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tokenHash) { setMessage("This password reset link is invalid or expired."); setState("error"); return; }
    if (password.length < 8) { setMessage("Use a password with at least 8 characters."); return; }
    if (password !== confirmPassword) { setMessage("Passwords do not match."); return; }
    const supabase = createBrowserSupabaseClient(); setMessage(""); setState("submitting"); let verifiedSession = false;
    try {
      const { data: verified, error: verifyError } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
      if (verifyError || !verified.user) throw new Error("This password reset link is invalid or expired.");
      verifiedSession = true;
      if (verified.user.app_metadata?.account_type !== "dealer_portal") throw new Error("This password reset link cannot be used here.");
      const { data: context, error: contextError } = await supabase.rpc("get_store_portal_context");
      if (contextError || !context || typeof context !== "object" || !("ok" in context) || context.ok !== true || !("portal_kind" in context) || context.portal_kind !== "dealer") throw new Error("This password reset link cannot be used here.");
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      await supabase.auth.signOut({ scope: "global" });
      window.location.assign("/dealer/login?status=password-reset");
    } catch (error) {
      if (verifiedSession) await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
      setTokenHash(""); setMessage(error instanceof Error ? error.message : "This password reset link cannot be used here."); setState("error");
    }
  }

  if (state === "loading") return <p className="portal-muted mb-0">Checking reset link…</p>;
  if (state === "error" && !tokenHash) return <div className="portal-form"><div className="portal-alert portal-alert--error" role="alert">{message}</div><Link href="/dealer/forgot-password" className="portal-link">Request a new reset link</Link></div>;

  return (
    <form onSubmit={handleSubmit} className="portal-form">
      {message ? <div className="portal-alert portal-alert--error" role="alert">{message}</div> : null}
      <div className="portal-field"><label className="portal-label" htmlFor="dealer-new-password">New password</label><input id="dealer-new-password" className="portal-input" type="password" autoComplete="new-password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} disabled={state !== "ready"} required /></div>
      <div className="portal-field"><label className="portal-label" htmlFor="dealer-new-password-confirm">Confirm password</label><input id="dealer-new-password-confirm" className="portal-input" type="password" autoComplete="new-password" minLength={8} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} disabled={state !== "ready"} required /></div>
      <button className="portal-button portal-button--primary portal-button--full" type="submit" disabled={state !== "ready"}>{state === "submitting" ? "Updating…" : "Update password"}</button>
    </form>
  );
}
