import type { UserRole } from "@/lib/supabase/profile";

export type SystemAnnouncementKind =
  | "new_feature"
  | "improvement"
  | "bug_fix"
  | "maintenance";

export type SystemAnnouncementStatus = "draft" | "published" | "archived";

export type SystemAnnouncement = {
  id: string;
  kind: SystemAnnouncementKind;
  title: string;
  message: string;
  href: string | null;
  cta_label: string | null;
  target_roles: UserRole[] | null;
  status: SystemAnnouncementStatus;
  published_at: string | null;
  created_by: string;
  published_by: string | null;
  created_at: string;
  updated_at: string;
};

export const SYSTEM_ANNOUNCEMENT_KIND_LABELS: Record<SystemAnnouncementKind, string> = {
  new_feature: "New Feature",
  improvement: "Improvement",
  bug_fix: "Bug Fix",
  maintenance: "Maintenance",
};

export const SYSTEM_ANNOUNCEMENT_ROLES: UserRole[] = [
  "super_admin",
  "admin",
  "sales",
  "finance",
  "hr",
  "warehouse",
  "shipping",
];

export function isSystemAnnouncementVisibleToRole(
  targetRoles: readonly UserRole[] | null | undefined,
  role: UserRole,
) {
  return !targetRoles?.length || targetRoles.includes(role);
}

export function systemAnnouncementSeverity(kind: SystemAnnouncementKind) {
  if (kind === "maintenance") return "warning" as const;
  if (kind === "bug_fix") return "success" as const;
  return "info" as const;
}
