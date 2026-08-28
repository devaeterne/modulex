"use client";

import Link from "next/link";
import { useActionState } from "react";
import { accountLoginAction, initialAccountLoginState } from "./actions";

export default function AccountLoginForm() {
  const [state, formAction, pending] = useActionState(accountLoginAction, initialAccountLoginState);

  return (
    <form action={formAction}>
      {state.error ? <div className="alert alert-warning" role="alert">{state.error}</div> : null}
      <div className="mb-3">
        <label className="form-label" htmlFor="account-email">Email</label>
        <input id="account-email" className="form-control" type="email" name="email" autoComplete="email" disabled={pending} required />
      </div>
      <div className="mb-3">
        <label className="form-label" htmlFor="account-password">Password</label>
        <input id="account-password" className="form-control" type="password" name="password" autoComplete="current-password" disabled={pending} required />
      </div>
      <div className="d-flex justify-content-end mb-4">
        <Link href="/dealer/forgot-password" className="small text-secondary">Forgot password?</Link>
      </div>
      <button className="btn btn-dark w-100" type="submit" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
    </form>
  );
}
