"use client";

import { useEffect } from "react";
import Alert from "@/components/ui/alert/Alert";
import Button from "@/components/ui/button/Button";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Admin route error:", error);
  }, [error]);

  return (
    <div className="space-y-4" role="alert">
      <Alert
        variant="error"
        title="Admin page could not be loaded"
        message="The current Modulex Admin page encountered an unexpected error. Retry the route; your existing authorization checks remain in effect."
      />
      <Button type="button" variant="outline" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
