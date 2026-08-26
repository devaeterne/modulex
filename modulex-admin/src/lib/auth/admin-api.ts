import type { User } from "@supabase/supabase-js";
import type { UserRole } from "@/lib/supabase/profile";
import { supabaseAdmin } from "@/lib/supabase/server-admin";

export type AdminActor = {
  user: User;
  profile: {
    id: string;
    role: UserRole;
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

  const typedProfile = profile as AdminActor["profile"];

  if (!typedProfile.is_active) {
    return {
      response: jsonError("This account is inactive.", 403),
    };
  }

  if (typedProfile.role !== "super_admin" && typedProfile.role !== "admin") {
    return {
      response: jsonError("Administrator access is required.", 403),
    };
  }

  return {
    actor: {
      user,
      profile: typedProfile,
    },
  };
}

export function canAssignRole(actorRole: UserRole, targetRole: UserRole) {
  if (targetRole === "super_admin") {
    return actorRole === "super_admin";
  }

  return actorRole === "super_admin" || actorRole === "admin";
}
