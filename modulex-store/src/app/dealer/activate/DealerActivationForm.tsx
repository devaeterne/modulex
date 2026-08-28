"use client";

import { FormEvent, useEffect, useState } from "react";

type ActivationState = "loading" | "ready" | "submitting" | "success" | "error";

type AuthUser = {
  app_metadata?: Record<string, unknown>;
};

type VerifyResponse = {
  access_token?: string;
  user?: AuthUser;
};

function getConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) return null;
  return { url, publishableKey };
}

async function messageFrom(response: Response, fallback: string) {
  try {
    const body = (await response.json()) as { message?: string; msg?: string; error_description?: string };
    return body.message || body.msg || body.error_description || fallback;
  } catch {
    return fallback;
  }
}

export default function DealerActivationForm() {
  const [state, setState] = useState<ActivationState>("loading");
  const [tokenHash, setTokenHash] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const config = getConfig();
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token_hash") || "";
    const type = params.get("type") || "";

    window.history.replaceState({}, "", window.location.pathname);

    if (!config) {
      setMessage("Dealer activation is not configured.");
      setState("error");
      return;
    }

    if (!token || type !== "recovery") {
      setMessage("Open the activation link from your dealer invitation email.");
      setState("error");
      return;
    }

    setTokenHash(token);
    setState("ready");
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const config = getConfig();

    if (!config || !tokenHash) {
      setMessage("This invitation token is no longer available. Ask your Oakwell administrator to resend it.");
      setState("error");
      return;
    }

    if (password.length < 8) {
      setMessage("Use a password with at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }

    setMessage("");
    setState("submitting");
    let accessToken = "";

    try {
      const verifyResponse = await fetch(`${config.url}/auth/v1/verify`, {
        method: "POST",
        headers: {
          apikey: config.publishableKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token_hash: tokenHash, type: "recovery" }),
        cache: "no-store",
      });
      if (!verifyResponse.ok) throw new Error(await messageFrom(verifyResponse, "The invitation token is invalid or expired."));

      const verified = (await verifyResponse.json()) as VerifyResponse;
      accessToken = verified.access_token || "";
      if (!accessToken) throw new Error("The invitation did not create a valid activation session.");
      if (verified.user?.app_metadata?.account_type !== "dealer_portal") {
        throw new Error("This invitation is not a dealer portal invitation.");
      }

      const headers = {
        apikey: config.publishableKey,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      };

      const passwordResponse = await fetch(`${config.url}/auth/v1/user`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ password }),
      });
      if (!passwordResponse.ok) throw new Error(await messageFrom(passwordResponse, "Unable to set the password."));

      const activationResponse = await fetch(`${config.url}/rest/v1/rpc/activate_store_dealer_portal_user`, {
        method: "POST",
        headers,
        body: "{}",
        cache: "no-store",
      });
      if (!activationResponse.ok) throw new Error(await messageFrom(activationResponse, "Unable to activate the dealer account."));

      const activation = (await activationResponse.json()) as { ok?: boolean; reason?: string };
      if (!activation.ok) throw new Error("This dealer invitation can no longer be activated. Ask your Oakwell administrator to resend it.");

      await fetch(`${config.url}/auth/v1/logout`, {
        method: "POST",
        headers,
      }).catch(() => undefined);

      setTokenHash("");
      setPassword("");
      setConfirmPassword("");
      setMessage("Your dealer account is activated. Sign-in access will be enabled with the dealer portal release.");
      setState("success");
    } catch (error) {
      if (accessToken && config) {
        await fetch(`${config.url}/auth/v1/logout`, {
          method: "POST",
          headers: {
            apikey: config.publishableKey,
            Authorization: `Bearer ${accessToken}`,
          },
        }).catch(() => undefined);
      }
      setTokenHash("");
      setMessage(error instanceof Error ? error.message : "Unable to activate the dealer account.");
      setState("error");
    }
  }

  if (state === "loading") {
    return <p className="text-secondary mb-0">Checking invitation…</p>;
  }

  if (state === "success") {
    return <div className="alert alert-success mb-0" role="status">{message}</div>;
  }

  return (
    <form onSubmit={handleSubmit}>
      {message ? <div className="alert alert-warning" role="alert">{message}</div> : null}
      <div className="mb-3">
        <label className="form-label" htmlFor="dealer-password">Password</label>
        <input
          id="dealer-password"
          className="form-control"
          type="password"
          autoComplete="new-password"
          minLength={8}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={state !== "ready"}
          required
        />
      </div>
      <div className="mb-4">
        <label className="form-label" htmlFor="dealer-password-confirm">Confirm password</label>
        <input
          id="dealer-password-confirm"
          className="form-control"
          type="password"
          autoComplete="new-password"
          minLength={8}
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          disabled={state !== "ready"}
          required
        />
      </div>
      <button className="btn btn-dark w-100" type="submit" disabled={state !== "ready"}>
        {state === "submitting" ? "Activating…" : "Activate account"}
      </button>
    </form>
  );
}
