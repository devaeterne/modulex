"use client";

import Link from "next/link";
import { useActionState } from "react";
import { accountLoginAction, type AccountLoginState } from "./actions";

const initialAccountLoginState: AccountLoginState = { error: null };

export default function AccountLoginForm() {
  const [state, formAction, pending] = useActionState(accountLoginAction, initialAccountLoginState);

  return (
    <form action={formAction} className="portal-form">
      {state.error ? <div className="portal-alert portal-alert--error" role="alert">{state.error}</div> : null}
      <div className="portal-field">
        <label className="portal-label" htmlFor="account-email">Email</label>
        <input id="account-email" className="portal-input" type="email" name="email" autoComplete="email" disabled={pending} required />
      </div>
      <div className="portal-field">
        <label className="portal-label" htmlFor="account-password">Password</label>
        <input id="account-password" className="portal-input" type="password" name="password" autoComplete="current-password" disabled={pending} required />
      </div>
      <div className="portal-form__aside">
        <Link href="/account/forgot-password" className="portal-link">Forgot password?</Link>
      </div>
      <button className="portal-button portal-button--primary portal-button--full" type="submit" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
    </form>
  );
}
