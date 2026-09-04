"use client";

import { useRouter } from "next/navigation";
import ComponentCard from "@/components/common/ComponentCard";
import Button from "@/components/ui/button/Button";

export default function GoogleCalendarIntegrationLink() {
  const router = useRouter();

  return (
    <ComponentCard
      title="Integrations"
      desc="Connect external services used by Modulex operations."
      headerAction={
        <Button
          size="sm"
          variant="outline"
          onClick={() => router.push("/settings/integrations/google-calendar")}
        >
          Manage Google Calendar
        </Button>
      }
    >
      <p className="text-sm">
        Google Calendar can create a dedicated calendar for each Project while Modulex remains the scheduling source of truth.
      </p>
    </ComponentCard>
  );
}
