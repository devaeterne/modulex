import type { UserRole } from "@/lib/supabase/profile";
import {
  canAssignRoles,
  jsonError,
  requireAdmin,
} from "@/lib/auth/admin-api";
import { withApiTiming } from "@/lib/observability/apiTiming";
import { supabaseAdmin } from "@/lib/supabase/server-admin";
import { isValidEmail, isValidPhone } from "@/lib/validation";

const ROLE_PRIORITY: UserRole[] = [
  "super_admin",
  "admin",
  "sales",
  "finance",
  "warehouse",
  "shipping",
  "hr",
];

const VALID_ROLES = new Set<UserRole>(ROLE_PRIORITY);

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type UserProfile = ProfileRow & {
  roles: UserRole[];
};

type RoleValidationResult =
  | { ok: true; roles: UserRole[] }
  | { ok: false; error: string };

function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && VALID_ROLES.has(value as UserRole);
}

function normalizeRequestedRoles(value: unknown): RoleValidationResult {
  const rawRoles = Array.isArray(value) ? value : [value];

  if (rawRoles.length === 0 || rawRoles.some((role) => !isUserRole(role))) {
    return { ok: false, error: "At least one valid user role is required." };
  }

  const roles = Array.from(new Set(rawRoles as UserRole[])).sort(
    (a, b) => ROLE_PRIORITY.indexOf(a) - ROLE_PRIORITY.indexOf(b)
  );

  const hasElevatedRole = roles.includes("super_admin") || roles.includes("admin");

  if (hasElevatedRole && roles.length > 1) {
    return {
      ok: false,
      error: "Admin and Super Admin roles must be assigned exclusively.",
    };
  }

  return { ok: true, roles };
}

function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeOptionalText(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized || null;
}

function getSiteUrl(request: Request) {
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();

  if (configuredSiteUrl) {
    return configuredSiteUrl.replace(/\/$/, "");
  }

  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();

  if (forwardedHost) {
    const forwardedProto =
      request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";

    return `${forwardedProto}://${forwardedHost}`.replace(/\/$/, "");
  }

  return new URL(request.url).origin.replace(/\/$/, "");
}

async function getRolesForUser(userId: string, fallbackRole: UserRole) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);

  if (error) {
    return [fallbackRole];
  }

  const roles = Array.from(
    new Set((data ?? []).map((row) => row.role as UserRole))
  ).sort((a, b) => ROLE_PRIORITY.indexOf(a) - ROLE_PRIORITY.indexOf(b));

  return roles.length > 0 ? roles : [fallbackRole];
}

async function getProfile(userId: string): Promise<UserProfile | null> {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, email, phone, role, is_active, created_at, updated_at")
    .eq("id", userId)
    .maybeSingle();

  if (!data) {
    return null;
  }

  const profile = data as ProfileRow;

  return {
    ...profile,
    roles: await getRolesForUser(profile.id, profile.role),
  };
}

async function countActiveSuperAdmins() {
  const { count } = await supabaseAdmin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "super_admin")
    .eq("is_active", true);

  return count ?? 0;
}

async function setUserRoles(
  userId: string,
  roles: UserRole[],
  actorUserId: string
) {
  return supabaseAdmin.rpc("set_user_roles", {
    target_user_id: userId,
    target_roles: roles,
    actor_user_id: actorUserId,
  });
}

async function handleGet(request: Request) {
  const auth = await requireAdmin(request);

  if (auth.response) {
    return auth.response;
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number(searchParams.get("page") || "1") || 1);
  const perPage = Math.min(
    100,
    Math.max(1, Number(searchParams.get("perPage") || "100") || 100)
  );

  const { data, error } = await supabaseAdmin.auth.admin.listUsers({
    page,
    perPage,
  });

  if (error) {
    return jsonError(error.message, 500);
  }

  const userIds = data.users.map((user) => user.id);
  let profiles: ProfileRow[] = [];
  const roleMap = new Map<string, UserRole[]>();

  if (userIds.length > 0) {
    const [{ data: profileRows, error: profileError }, { data: roleRows, error: roleError }] =
      await Promise.all([
        supabaseAdmin
          .from("profiles")
          .select("id, full_name, email, phone, role, is_active, created_at, updated_at")
          .in("id", userIds),
        supabaseAdmin
          .from("user_roles")
          .select("user_id, role")
          .in("user_id", userIds),
      ]);

    if (profileError) {
      return jsonError(profileError.message, 500);
    }

    if (roleError) {
      return jsonError(roleError.message, 500);
    }

    profiles = (profileRows ?? []) as ProfileRow[];

    for (const row of roleRows ?? []) {
      const userId = String(row.user_id);
      const current = roleMap.get(userId) ?? [];
      current.push(row.role as UserRole);
      roleMap.set(userId, current);
    }
  }

  const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));

  const users = data.users
    .filter((user) => profileMap.has(user.id))
    .map((user) => {
      const profile = profileMap.get(user.id)!;
      const assignedRoles = roleMap.get(user.id) ?? [];
      const roles = Array.from(new Set(assignedRoles)).sort(
        (a, b) => ROLE_PRIORITY.indexOf(a) - ROLE_PRIORITY.indexOf(b)
      );

      return {
        id: user.id,
        email: user.email ?? profile.email ?? null,
        full_name:
          profile.full_name ??
          (typeof user.user_metadata?.full_name === "string"
            ? user.user_metadata.full_name
            : null),
        phone: profile.phone ?? user.phone ?? null,
        role: profile.role,
        roles: roles.length > 0 ? roles : [profile.role],
        is_active: profile.is_active,
        email_confirmed_at: user.email_confirmed_at ?? null,
        last_sign_in_at: user.last_sign_in_at ?? null,
        created_at: profile.created_at,
        updated_at: profile.updated_at,
      };
    });

  return Response.json({
    users,
    page,
    perPage,
    total: users.length,
    actor: {
      id: auth.actor.user.id,
      role: auth.actor.profile.role,
      roles: auth.actor.profile.roles,
    },
  });
}

async function handlePost(request: Request) {
  const auth = await requireAdmin(request);

  if (auth.response) {
    return auth.response;
  }

  let body: Record<string, unknown>;

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonError("Invalid request body.", 400);
  }

  const email = normalizeEmail(body.email);
  const fullName = normalizeOptionalText(body.full_name);
  const phone = normalizeOptionalText(body.phone);
  const roleResult = normalizeRequestedRoles(body.roles ?? body.role);
  const mode = body.mode === "password" ? "password" : "invite";
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !isValidEmail(email)) {
    return jsonError("A valid email address is required.", 400);
  }

  if (phone && !isValidPhone(phone)) {
    return jsonError(
      "Phone must contain 7 to 15 digits and cannot contain letters.",
      400
    );
  }

  if (!roleResult.ok) {
    return jsonError(roleResult.error, 400);
  }

  const roles = roleResult.roles;

  if (!canAssignRoles(auth.actor.profile.roles, roles)) {
    return jsonError("Only a Super Admin can assign the Super Admin role.", 403);
  }

  if (mode === "password" && password.length < 8) {
    return jsonError("Temporary password must be at least 8 characters.", 400);
  }

  let createdUserId: string | null = null;

  if (mode === "password") {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
      },
    });

    if (error || !data.user) {
      return jsonError(error?.message ?? "User could not be created.", 400);
    }

    createdUserId = data.user.id;
  } else {
    const siteUrl = getSiteUrl(request);
    const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      email,
      {
        data: {
          full_name: fullName,
        },
        redirectTo: `${siteUrl}/reset-password?mode=invite`,
      }
    );

    if (error || !data.user) {
      return jsonError(error?.message ?? "Invitation could not be sent.", 400);
    }

    createdUserId = data.user.id;
  }

  const { error: profileError } = await supabaseAdmin.from("profiles").upsert({
    id: createdUserId,
    full_name: fullName,
    email,
    phone,
    role: roles[0],
    is_active: true,
  });

  if (profileError) {
    await supabaseAdmin.auth.admin.deleteUser(createdUserId);
    return jsonError(profileError.message, 500);
  }

  const { error: rolesError } = await setUserRoles(
    createdUserId,
    roles,
    auth.actor.user.id
  );

  if (rolesError) {
    await supabaseAdmin.auth.admin.deleteUser(createdUserId);
    return jsonError(rolesError.message, 500);
  }

  return Response.json(
    {
      user: await getProfile(createdUserId),
      mode,
    },
    { status: 201 }
  );
}

async function handlePatch(request: Request) {
  const auth = await requireAdmin(request);

  if (auth.response) {
    return auth.response;
  }

  let body: Record<string, unknown>;

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonError("Invalid request body.", 400);
  }

  const userId = typeof body.user_id === "string" ? body.user_id : "";
  const action = typeof body.action === "string" ? body.action : "update";

  if (!userId) {
    return jsonError("User ID is required.", 400);
  }

  const currentProfile = await getProfile(userId);

  if (!currentProfile) {
    return jsonError("User profile was not found.", 404);
  }

  const targetIsSuperAdmin = currentProfile.roles.includes("super_admin");
  const actorIsSuperAdmin = auth.actor.profile.roles.includes("super_admin");

  if (targetIsSuperAdmin && !actorIsSuperAdmin) {
    return jsonError("Only a Super Admin can modify a Super Admin account.", 403);
  }

  if (action === "set_password") {
    const password = typeof body.password === "string" ? body.password : "";

    if (password.length < 8) {
      return jsonError("Password must be at least 8 characters.", 400);
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password,
    });

    if (error) {
      return jsonError(error.message, 400);
    }

    return Response.json({ success: true });
  }

  if (action === "send_reset") {
    const email = normalizeEmail(currentProfile.email);

    if (!email || !isValidEmail(email)) {
      return jsonError("This user does not have a valid email address.", 400);
    }

    const siteUrl = getSiteUrl(request);
    const { error } = await supabaseAdmin.auth.resetPasswordForEmail(email, {
      redirectTo: `${siteUrl}/reset-password?mode=recovery`,
    });

    if (error) {
      return jsonError(error.message, 400);
    }

    return Response.json({ success: true });
  }

  if (action === "set_active") {
    if (userId === auth.actor.user.id && body.is_active === false) {
      return jsonError("You cannot deactivate your own account.", 400);
    }

    const isActive = body.is_active === true;

    if (targetIsSuperAdmin && !isActive) {
      const superAdminCount = await countActiveSuperAdmins();

      if (superAdminCount <= 1) {
        return jsonError("The last active Super Admin cannot be deactivated.", 400);
      }
    }

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ is_active: isActive })
      .eq("id", userId);

    if (error) {
      return jsonError(error.message, 500);
    }

    return Response.json({
      success: true,
      user: await getProfile(userId),
    });
  }

  const roleResult = normalizeRequestedRoles(body.roles ?? body.role);

  if (!roleResult.ok) {
    return jsonError(roleResult.error, 400);
  }

  const nextRoles = roleResult.roles;

  if (!canAssignRoles(auth.actor.profile.roles, nextRoles)) {
    return jsonError("Only a Super Admin can assign the Super Admin role.", 403);
  }

  if (
    userId === auth.actor.user.id &&
    targetIsSuperAdmin &&
    !nextRoles.includes("super_admin")
  ) {
    return jsonError("You cannot demote your own Super Admin account.", 400);
  }

  if (targetIsSuperAdmin && !nextRoles.includes("super_admin")) {
    const superAdminCount = await countActiveSuperAdmins();

    if (currentProfile.is_active && superAdminCount <= 1) {
      return jsonError("The last active Super Admin cannot be demoted.", 400);
    }
  }

  const fullName = normalizeOptionalText(body.full_name);
  const phone = normalizeOptionalText(body.phone);
  const email = normalizeEmail(body.email ?? currentProfile.email);

  if (!email || !isValidEmail(email)) {
    return jsonError("A valid email address is required.", 400);
  }

  if (phone && !isValidPhone(phone)) {
    return jsonError(
      "Phone must contain 7 to 15 digits and cannot contain letters.",
      400
    );
  }

  if (email !== currentProfile.email) {
    const { error: authEmailError } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      { email }
    );

    if (authEmailError) {
      return jsonError(authEmailError.message, 400);
    }
  }

  const { error: profileError } = await supabaseAdmin
    .from("profiles")
    .update({
      full_name: fullName,
      email,
      phone,
    })
    .eq("id", userId);

  if (profileError) {
    return jsonError(profileError.message, 500);
  }

  const { error: rolesError } = await setUserRoles(
    userId,
    nextRoles,
    auth.actor.user.id
  );

  if (rolesError) {
    return jsonError(rolesError.message, 500);
  }

  return Response.json({
    success: true,
    user: await getProfile(userId),
  });
}

async function handleDelete(request: Request) {
  const auth = await requireAdmin(request);

  if (auth.response) {
    return auth.response;
  }

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("user_id") ?? "";

  if (!userId) {
    return jsonError("User ID is required.", 400);
  }

  if (userId === auth.actor.user.id) {
    return jsonError("You cannot delete your own account.", 400);
  }

  const currentProfile = await getProfile(userId);

  if (!currentProfile) {
    return jsonError("User profile was not found.", 404);
  }

  if (currentProfile.roles.includes("super_admin")) {
    if (!auth.actor.profile.roles.includes("super_admin")) {
      return jsonError("Only a Super Admin can delete a Super Admin account.", 403);
    }

    const superAdminCount = await countActiveSuperAdmins();

    if (currentProfile.is_active && superAdminCount <= 1) {
      return jsonError("The last active Super Admin cannot be deleted.", 400);
    }
  }

  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);

  if (error) {
    return jsonError(error.message, 400);
  }

  return Response.json({ success: true });
}

export async function GET(request: Request) {
  return withApiTiming({ route: "/api/admin/users", method: "GET" }, () => handleGet(request));
}

export async function POST(request: Request) {
  return withApiTiming({ route: "/api/admin/users", method: "POST" }, () => handlePost(request));
}

export async function PATCH(request: Request) {
  return withApiTiming({ route: "/api/admin/users", method: "PATCH" }, () => handlePatch(request));
}

export async function DELETE(request: Request) {
  return withApiTiming({ route: "/api/admin/users", method: "DELETE" }, () => handleDelete(request));
}
