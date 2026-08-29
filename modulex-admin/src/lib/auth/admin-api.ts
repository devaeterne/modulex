import type { User } from "@supabase/supabase-js";
import { isAdminRole } from "@/lib/auth/permissions";
import type { UserRole } from "@/lib/supabase/profile";
import {
  isSupabaseAdminConfigured,
  supabaseAdmin,
} from "@/lib/supabase/server-admin";

export type AdminActor = {
  user: User;
  profile: {
    id: string;
    role: UserRole;
    roles: UserRole[];
    is_active: boolean;
  };
};

export function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function requireAdmin(request: Request): Promise<
  | { actor: AdminActor; response?: never }
  | { actor?: never; response: Response }
> {
  if (!isSupabaseAdminConfigured) {
    return {
      response: jsonError(
        "Server user management is not configured. Add SUPABASE_SECRET_KEY to the deployment environment.",
        503
      ),
    };
  }

  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return {
      response: jsonError("Authentication required.", 401),
    };
  }

  const accessToken = authorization.slice("Bearer ".length).trim();

  if (!accessToken) {
    return {
      response: jsonError("Authentication required.", 401),
    };
  }

  const {
    data: { user },
    error: userError,
  } = await supabaseAdmin.auth.getUser(accessToken);

  if (userError || !user) {
    return {
      response: jsonError("Invalid or expired session.", 401),
    };
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, role, is_active")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    return {
      response: jsonError("User profile is missing.", 403),
    };
  }

  const typedProfile = profile as Omit<AdminActor["profile"], "roles">;

  if (!typedProfile.is_active) {
    return {
      response: jsonError("This account is inactive.", 403),
    };
  }

  const { data: roleRows, error: roleError } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);

  if (roleError) {
    return {
      response: jsonError("User roles could not be resolved.", 500),
    };
  }

  const roles = Array.from(
    new Set((roleRows ?? []).map((row) => row.role as UserRole))
  );
  const effectiveRoles = roles.length > 0 ? roles : [typedProfile.role];

  if (!isAdminRole(effectiveRoles)) {
    return {
      response: jsonError("Administrator access is required.", 403),
    };
  }

  return {
    actor: {
      user,
      profile: {
        ...typedProfile,
        roles: effectiveRoles,
      },
    },
  };
}

export function canAssignRoles(
  actorRoles: readonly UserRole[],
  targetRoles: readonly UserRole[]
) {
  const actorIsSuperAdmin = actorRoles.includes("super_admin");
  const actorIsAdmin = actorIsSuperAdmin || actorRoles.includes("admin");

  if (!actorIsAdmin) {
    return false;
  }

  if (targetRoles.includes("super_admin")) {
    return actorIsSuperAdmin;
  }

  return true;
}

export function canAssignRole(actorRole: UserRole, targetRole: UserRole) {
  return canAssignRoles([actorRole], [targetRole]);
}
