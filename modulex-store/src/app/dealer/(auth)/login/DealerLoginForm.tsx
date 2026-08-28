"use client";

import Link from "next/link";
import { useActionState } from "react";
import { dealerLoginAction, initialDealerLoginState } from "./actions";

export default function DealerLoginForm() {
  const [state, formAction, pending] = useActionState(dealerLoginAction, initialDealerLoginState);

  return (
    <form action={formAction} className="portal-form">
      {state.error ? <div className="portal-alert portal-alert--error" role="alert">{state.error}</div> : null}
      <div className="portal-field">
        <label className="portal-label" htmlFor="dealer-email">Email</label>
        <input id="dealer-email" className="portal-input" type="email" name="email" autoComplete="email" disabled={pending} required />
      </div>
      <div className="portal-field">
        <label className="portal-label" htmlFor="dealer-password">Password</label>
        <input id="dealer-password" className="portal-input" type="password" name="password" autoComplete="current-password" disabled={pending} required />
      </div>
      <div className="portal-form__aside">
        <Link href="/dealer/forgot-password" className="portal-link">Forgot password?</Link>
      </div>
      <button className="portal-button portal-button--primary portal-button--full" type="submit" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
