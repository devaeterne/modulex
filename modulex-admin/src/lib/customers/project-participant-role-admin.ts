import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";

export type ProjectParticipantRoleAdminRow = {
  id: string;
  roleKey: string;
  label: string;
  isSystem: boolean;
  isActive: boolean;
};

async function requireAdminRole() {
  const { profile, error } = await getCurrentProfile();
  if (error) throw error;
  if (!profile || !profile.roles.some((role) => role === "super_admin" || role === "admin")) {
    throw new Error("You do not have permission to configure Project participant roles.");
  }
  return profile;
}

export async function canConfigureProjectParticipantRoles() {
  const { profile, error } = await getCurrentProfile();
  if (error) throw error;
  return Boolean(profile?.roles.some((role) => role === "super_admin" || role === "admin"));
}

export async function listProjectParticipantRolesForAdmin(): Promise<ProjectParticipantRoleAdminRow[]> {
  await requireAdminRole();
  const { data, error } = await supabase
    .from("project_participant_roles")
    .select("id, role_key, label, is_system, is_active")
    .order("sort_order")
    .order("label");
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: String(row.id),
    roleKey: String(row.role_key),
    label: String(row.label),
    isSystem: Boolean(row.is_system),
    isActive: Boolean(row.is_active),
  }));
}

export async function upsertProjectParticipantRole(input: {
  roleKey: string;
  label: string;
  isActive: boolean;
}) {
  await requireAdminRole();
  const roleKey = input.roleKey.trim().toLowerCase();
  const label = input.label.trim();
  if (!/^[a-z][a-z0-9_]*$/.test(roleKey)) {
    throw new Error("Role key must start with a letter and use only lowercase letters, numbers, or underscores.");
  }
  if (!label) throw new Error("Role label is required.");

  const { data, error } = await supabase.rpc("upsert_customer_project_participant_role", {
    p_role_key: roleKey,
    p_label: label,
    p_is_active: input.isActive,
  });
  if (error) throw error;
  return data as string;
}
