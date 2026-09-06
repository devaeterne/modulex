import "server-only";

import { flushCalendarOutboxBatch } from "@/lib/google-calendar/bidirectional-sync";
import { getCompanyCalendarBinding } from "@/lib/google-calendar/v3-repository";
import { supabaseAdmin } from "@/lib/supabase/server-admin";

async function countProjectMilestones(projectId: string) {
  const { data, error } = await supabaseAdmin
    .from("customer_projects")
    .select("id,start_date,target_date,planned_delivery_date")
    .eq("id", projectId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Project was not found.");
  return [data.start_date, data.target_date, data.planned_delivery_date].filter(Boolean).length;
}

/**
 * Compatibility entrypoint for existing Project APIs.
 * Calendar V3 never creates or resolves a Project-specific Google Calendar.
 * Project schedule DB triggers enqueue the exact milestone sources against the
 * single Company Calendar; this function only attempts an immediate flush.
 */
export async function syncProjectScheduleToGoogle(
  projectId: string,
  _actorId: string,
  requestUrl?: string,
) {
  const total = 3;
  const activeMilestones = await countProjectMilestones(projectId);
  const binding = await getCompanyCalendarBinding();
  if (!binding || !binding.sync_enabled) {
    return { total, synced: 0, errors: 0, skipped: total };
  }

  const result = await flushCalendarOutboxBatch(50, requestUrl);
  const errors = Math.min(activeMilestones, result.errors);
  const synced = Math.max(0, activeMilestones - errors);
  return { total, synced, errors, skipped: total - activeMilestones };
}
