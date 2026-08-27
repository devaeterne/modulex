import type { UserRole } from "@/lib/supabase/profile";
import {
  canAssignRole,
  jsonError,
  requireAdmin,
} from "@/lib/auth/admin-api";
import { supabaseAdmin } from "@/lib/supabase/server-admin";
import { isValidEmail, isValidPhone } from "@/lib/validation";

const VALID_ROLES: UserRole[] = [
  "super_admin",
  "admin",
  "sales",
  "finance",
  "hr",
  "warehouse",
  "shipping",
];

function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && VALID_ROLES.includes(value as UserRole);
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

async function getProfile(userId: string) {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, email, phone, role, is_active, created_at, updated_at")
    .eq("id", userId)
    .maybeSingle();

  return data;
}

async function countActiveSuperAdmins() {
  const { count } = await supabaseAdmin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "super_admin")
    .eq("is_active", true);

  return count ?? 0;
}

export async function GET(request: Request) {
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
  let profiles: Array<Record<string, unknown>> = [];

  if (userIds.length > 0) {
    const { data: profileRows, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email, phone, role, is_active, created_at, updated_at")
      .in("id", userIds);

    if (profileError) {
      return jsonError(profileError.message, 500);
    }

    profiles = (profileRows ?? []) as Array<Record<string, unknown>>;
  }

  const profileMap = new Map(
    profiles.map((profile) => [String(profile.id), profile])
  );

  const users = data.users.map((user) => {
    const profile = profileMap.get(user.id);

    return {
      id: user.id,
      email: user.email ?? profile?.email ?? null,
      full_name:
        profile?.full_name ??
        (typeof user.user_metadata?.full_name === "string"
          ? user.user_metadata.full_name
          : null),
      phone: profile?.phone ?? user.phone ?? null,
      role: profile?.role ?? "warehouse",
      is_active: profile?.is_active ?? true,
      email_confirmed_at: user.email_confirmed_at ?? null,
      last_sign_in_at: user.last_sign_in_at ?? null,
      created_at: profile?.created_at ?? user.created_at,
      updated_at: profile?.updated_at ?? user.updated_at ?? user.created_at,
    };
  });

  return Response.json({
    users,
    page,
    perPage,
    total: data.total ?? users.length,
    actor: {
      id: auth.actor.user.id,
      role: auth.actor.profile.role,
    },
  });
}

export async function POST(request: Request) {
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
  const role = body.role;
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

  if (!isUserRole(role)) {
    return jsonError("A valid user role is required.", 400);
  }

  if (!canAssignRole(auth.actor.profile.role, role)) {
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
        redirectTo: `${siteUrl}/reset-password`,
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
    role,
    is_active: true,
  });

  if (profileError) {
    await supabaseAdmin.auth.admin.deleteUser(createdUserId);
    return jsonError(profileError.message, 500);
  }

  return Response.json(
    {
      user: await getProfile(createdUserId),
      mode,
    },
    { status: 201 }
  );
}

export async function PATCH(request: Request) {
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

  const targetRole = currentProfile.role as UserRole;

  if (targetRole === "super_admin" && auth.actor.profile.role !== "super_admin") {
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
      redirectTo: `${siteUrl}/reset-password`,
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

    if (targetRole === "super_admin" && !isActive) {
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

  const nextRole = body.role;

  if (!isUserRole(nextRole)) {
    return jsonError("A valid user role is required.", 400);
  }

  if (!canAssignRole(auth.actor.profile.role, nextRole)) {
    return jsonError("Only a Super Admin can assign the Super Admin role.", 403);
  }

  if (
    userId === auth.actor.user.id &&
    currentProfile.role === "super_admin" &&
    nextRole !== "super_admin"
  ) {
    return jsonError("You cannot demote your own Super Admin account.", 400);
  }

  if (currentProfile.role === "super_admin" && nextRole !== "super_admin") {
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

  const { error } = await supabaseAdmin
    .from("profiles")
    .update({
      full_name: fullName,
      email,
      phone,
      role: nextRole,
    })
    .eq("id", userId);

  if (error) {
    return jsonError(error.message, 500);
  }

  return Response.json({
    success: true,
    user: await getProfile(userId),
  });
}

export async function DELETE(request: Request) {
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

  if (currentProfile.role === "super_admin") {
    if (auth.actor.profile.role !== "super_admin") {
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
