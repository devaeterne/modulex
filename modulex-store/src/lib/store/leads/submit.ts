import "server-only";
import type { StoreLeadSubmission, StoreLeadSubmissionResult } from "./types";

function getPublicSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error("Public Supabase configuration is missing.");
  }

  return { url, publishableKey };
}

export async function submitStoreLead(
  payload: StoreLeadSubmission
): Promise<StoreLeadSubmissionResult> {
  const { url, publishableKey } = getPublicSupabaseConfig();
  const response = await fetch(`${url}/rest/v1/rpc/submit_store_lead`, {
    method: "POST",
    headers: {
      apikey: publishableKey,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_payload: payload }),
    cache: "no-store",
  });

  if (!response.ok) {
    console.error("Store lead submission RPC failed", { status: response.status });
    throw new Error("Unable to submit your request right now.");
  }

  const rows = (await response.json()) as StoreLeadSubmissionResult[];
  const result = rows[0];

  if (!result?.id || !result.reference_code) {
    throw new Error("Lead submission did not return a reference code.");
  }

  return result;
}
