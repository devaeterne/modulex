"use client";

import Link from "next/link";
import { useActionState } from "react";
import { dealerLoginAction, initialDealerLoginState } from "./actions";

export default function DealerLoginForm() {
  const [state, formAction, pending] = useActionState(dealerLoginAction, initialDealerLoginState);

  return (
    <form action={formAction}>
      {state.error ? <div className="alert alert-warning" role="alert">{state.error}</div> : null}

      <div className="mb-3">
        <label className="form-label" htmlFor="dealer-email">Email</label>
        <input
          id="dealer-email"
          className="form-control"
          type="email"
          name="email"
          autoComplete="email"
          disabled={pending}
          required
        />
      </div>

      <div className="mb-3">
        <label className="form-label" htmlFor="dealer-password">Password</label>
        <input
          id="dealer-password"
          className="form-control"
          type="password"
          name="password"
          autoComplete="current-password"
          disabled={pending}
          required
        />
      </div>

      <div className="d-flex justify-content-end mb-4">
        <Link href="/dealer/forgot-password" className="small text-secondary">Forgot password?</Link>
      </div>

      <button className="btn btn-dark w-100" type="submit" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
