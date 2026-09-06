import "server-only";

export type CalendarConflictDecision = "google" | "modulex" | "none";

export function decideCalendarConflict(input: {
  providerChanged: boolean;
  modulexChanged: boolean;
  providerUpdatedAt: string | null;
  providerObservedAt: string;
  modulexUpdatedAt: string | null;
}): CalendarConflictDecision {
  if (!input.providerChanged && !input.modulexChanged) return "none";
  if (input.providerChanged && !input.modulexChanged) return "google";
  if (!input.providerChanged && input.modulexChanged) return "modulex";

  const provider = new Date(input.providerUpdatedAt || input.providerObservedAt).getTime();
  const modulex = input.modulexUpdatedAt ? new Date(input.modulexUpdatedAt).getTime() : 0;
  // Deterministic tie-breaker favors Modulex business/local state.
  return provider > modulex ? "google" : "modulex";
}
