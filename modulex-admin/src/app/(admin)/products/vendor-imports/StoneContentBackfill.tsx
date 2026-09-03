"use client";

import { useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { supabase } from "@/lib/supabase/client";

type BackfillResponse = {
  processed?: number;
  succeeded?: number;
  failed?: number;
  remaining?: number;
  results?: Array<{ itemId: string; status: "BACKFILLED" | "FAILED"; error?: string }>;
  error?: string;
};

async function accessToken() {
  const { data, error } = await supabase.auth.getSession();
  let session = data.session;
  if (error || !session?.access_token) throw new Error("Your admin session could not be verified.");
  const expiresAtMs = (session.expires_at ?? 0) * 1000;
  if (!expiresAtMs || expiresAtMs - Date.now() <= 60_000) {
    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError || !refreshed.session?.access_token) throw new Error("Your admin session expired. Please sign in again.");
    session = refreshed.session;
  }
  return session.access_token;
}

export default function StoneContentBackfill() {
  const [running, setRunning] = useState(false);
  const [completed, setCompleted] = useState(0);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [notice, setNotice] = useState<{ variant: "success" | "warning"; title: string; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runBackfill() {
    setRunning(true);
    setCompleted(0);
    setRemaining(null);
    setNotice(null);
    setError(null);

    try {
      let totalCompleted = 0;
      for (let batchIndex = 0; batchIndex < 20; batchIndex += 1) {
        const token = await accessToken();
        const response = await fetch("/api/vendor-catalog/stone/backfill-approved", {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ limit: 5 }),
        });
        const payload = (await response.json().catch(() => ({}))) as BackfillResponse;
        if (!response.ok) throw new Error(payload.error || `Stone content backfill failed with HTTP ${response.status}.`);

        const succeeded = payload.succeeded ?? 0;
        const failed = payload.failed ?? 0;
        const nextRemaining = payload.remaining ?? 0;
        totalCompleted += succeeded;
        setCompleted(totalCompleted);
        setRemaining(nextRemaining);

        if (failed > 0) {
          const firstFailure = payload.results?.find((result) => result.status === "FAILED")?.error;
          setNotice({
            variant: "warning",
            title: "Stone backfill paused",
            message: `${totalCompleted} products completed. ${failed} product${failed === 1 ? "" : "s"} failed in the latest batch${firstFailure ? `: ${firstFailure}` : "."}`,
          });
          return;
        }
        if (nextRemaining === 0 || (payload.processed ?? 0) === 0) {
          setNotice({
            variant: "success",
            title: "Stone content backfill complete",
            message: totalCompleted
              ? `${totalCompleted} approved Stone products were completed with Store content and available vendor media.`
              : "All approved Stone products already have Store content.",
          });
          return;
        }
      }

      setNotice({
        variant: "warning",
        title: "Stone backfill paused",
        message: "The safety batch limit was reached. Run the action again to continue remaining approved Stone products.",
      });
    } catch (backfillError) {
      setError(backfillError instanceof Error ? backfillError.message : String(backfillError));
    } finally {
      setRunning(false);
    }
  }

  return (
    <ComponentCard
      title="Approved Stone Content Backfill"
      desc="Completes previously approved Stone products with factual descriptions, draft Store content, and vendor images archived in Modulex Storage."
    >
      {notice ? <Alert variant={notice.variant} title={notice.title} message={notice.message} /> : null}
      {error ? <Alert variant="error" title="Stone backfill error" message={error} /> : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => void runBackfill()} disabled={running}>
          {running ? "Backfilling Approved Stone…" : "Backfill Approved Content"}
        </Button>
        {completed > 0 ? <Badge color="success">{completed} completed</Badge> : null}
        {remaining !== null ? <Badge color="light">{remaining} remaining</Badge> : null}
      </div>
    </ComponentCard>
  );
}
