import { jsonError, requireAdmin } from "@/lib/auth/admin-api";
import { sendDealerPortalInvite } from "@/lib/email/dealer-portal";
import { supabaseAdmin } from "@/lib/supabase/server-admin";

const PORTAL_ROLES = new Set(["admin", "buyer", "viewer"]);
const ACTIONS = new Set([
  "enable_portal",
  "disable_portal",
  "invite",
  "resend_invite",
  "suspend",
  "restore",
  "set_primary",
]);

type PortalUser = {
  id: string;
  customer_id: string;
  auth_user_id: string | null;
  full_name: string | null;
  login_email: string;
  portal_role: "admin" | "buyer" | "viewer";
  status: "never_invited" | "invited" | "active" | "suspended";
  is_primary: boolean;
  invited_at: string | null;
  activated_at: string | null;
};

type CustomerRow = {
  id: string;
  name: string;
  portal_enabled: boolean;
};

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function storeActivationUrl() {
  const base = (
    process.env.NEXT_PUBLIC_STORE_URL ||
    process.env.STORE_SITE_URL ||
    "https://oakwell-phi.vercel.app"
  ).replace(/\/$/, "");
  return `${base}/dealer/activate`;
}

async function getCustomer(customerId: string) {
  const { data, error } = await supabaseAdmin
    .from("customers")
    .select("id,name,portal_enabled")
    .eq("id", customerId)
    .single();
  if (error || !data) return null;
  return data as CustomerRow;
}

async function getPortalUser(customerId: string, portalUserId: string) {
  const { data, error } = await supabaseAdmin
    .from("customer_portal_users")
    .select("id,customer_id,auth_user_id,full_name,login_email,portal_role,status,is_primary,invited_at,activated_at")
    .eq("id", portalUserId)
    .eq("customer_id", customerId)
    .single();
  if (error || !data) return null;
  return data as PortalUser;
}

async function logActivity(params: {
  customerId: string;
  actorUserId: string;
  activityType: string;
  title: string;
  description?: string | null;
  portalUserId?: string | null;
}) {
  const { error } = await supabaseAdmin.from("customer_activity").insert({
    customer_id: params.customerId,
    activity_type: params.activityType,
    title: params.title,
    description: params.description || null,
    metadata: params.portalUserId ? { portal_user_id: params.portalUserId } : {},
    actor_user_id: params.actorUserId,
  });
  if (error) throw new Error(error.message);
}

async function bestEffortActivity(params: Parameters<typeof logActivity>[0]) {
  try {
    await logActivity(params);
  } catch (error) {
    console.error("Dealer portal activity log failed", error);
  }
}

async function generateActivationLink(email: string) {
  const redirectTo = storeActivationUrl();
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo },
  });
  if (error || !data?.properties?.action_link) {
    throw new Error(error?.message || "Unable to generate dealer activation link.");
  }
  return data.properties.action_link;
}

async function ensureDealerAuthUser(portalUser: PortalUser) {
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: portalUser.login_email,
    email_confirm: false,
    app_metadata: { account_type: "dealer_portal" },
    user_metadata: { full_name: portalUser.full_name || "" },
  });
  if (error || !data.user) throw new Error(error?.message || "Unable to create dealer Auth user.");

  const authUser = data.user;
  if (authUser.app_metadata?.account_type !== "dealer_portal") {
    await supabaseAdmin.auth.admin.deleteUser(authUser.id).catch(() => undefined);
    throw new Error("Dealer Auth user was not created with the required account boundary.");
  }

  const { data: internalProfile } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("id", authUser.id)
    .maybeSingle();

  if (internalProfile) {
    await supabaseAdmin.auth.admin.deleteUser(authUser.id).catch(() => undefined);
    throw new Error("Dealer Auth user unexpectedly received an internal profile.");
  }

  return authUser;
}

async function validateLinkedDealerAuth(portalUser: PortalUser) {
  if (!portalUser.auth_user_id) throw new Error("Portal user is not linked to an Auth account.");
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(portalUser.auth_user_id);
  const authUser = data?.user;
  if (error || !authUser) throw new Error(error?.message || "Linked dealer Auth user was not found.");
  if (authUser.email?.trim().toLowerCase() !== portalUser.login_email.trim().toLowerCase()) {
    throw new Error("Linked Auth email does not match the portal user.");
  }
  if (authUser.app_metadata?.account_type !== "dealer_portal") {
    throw new Error("Linked Auth user is not a dealer portal account.");
  }
  const { data: internalProfile } = await supabaseAdmin.from("profiles").select("id").eq("id", authUser.id).maybeSingle();
  if (internalProfile) throw new Error("Linked dealer Auth user has an internal profile and cannot be used.");
  return authUser;
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonError("Invalid request body.", 400);
  }

  if (!isUuid(body.customer_id)) return jsonError("A valid customer is required.", 400);
  const customerId = body.customer_id;
  const customer = await getCustomer(customerId);
  if (!customer) return jsonError("Customer not found.", 404);

  const fullName = typeof body.full_name === "string" ? body.full_name.trim() : "";
  const loginEmail = normalizeEmail(body.login_email);
  const portalRole = typeof body.portal_role === "string" ? body.portal_role : "buyer";
  const isPrimary = body.is_primary === true;

  if (!loginEmail || !loginEmail.includes("@")) return jsonError("A valid login email is required.", 400);
  if (!PORTAL_ROLES.has(portalRole)) return jsonError("Invalid portal role.", 400);

  if (isPrimary) {
    const { error: primaryError } = await supabaseAdmin
      .from("customer_portal_users")
      .update({ is_primary: false, updated_by: auth.actor.user.id })
      .eq("customer_id", customerId)
      .eq("is_primary", true);
    if (primaryError) return jsonError(primaryError.message, 400);
  }

  const { data, error } = await supabaseAdmin
    .from("customer_portal_users")
    .insert({
      customer_id: customerId,
      full_name: fullName || null,
      login_email: loginEmail,
      portal_role: portalRole,
      status: "never_invited",
      auth_user_id: null,
      is_primary: isPrimary,
      created_by: auth.actor.user.id,
      updated_by: auth.actor.user.id,
    })
    .select("id,customer_id,auth_user_id,full_name,login_email,portal_role,status,is_primary,invited_at,activated_at")
    .single();

  if (error || !data) return jsonError(error?.message || "Unable to create portal user.", 400);

  await bestEffortActivity({
    customerId,
    actorUserId: auth.actor.user.id,
    activityType: "portal_user_created",
    title: "Dealer portal user created",
    description: loginEmail,
    portalUserId: data.id,
  });

  return Response.json({ ok: true, portal_user: data });
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonError("Invalid request body.", 400);
  }

  const action = typeof body.action === "string" ? body.action : "";
  if (!ACTIONS.has(action)) return jsonError("Invalid dealer portal action.", 400);
  if (!isUuid(body.customer_id)) return jsonError("A valid customer is required.", 400);
  const customerId = body.customer_id;
  const customer = await getCustomer(customerId);
  if (!customer) return jsonError("Customer not found.", 404);

  if (action === "enable_portal" || action === "disable_portal") {
    const enabled = action === "enable_portal";
    const { error } = await supabaseAdmin
      .from("customers")
      .update({ portal_enabled: enabled, updated_by: auth.actor.user.id })
      .eq("id", customerId);
    if (error) return jsonError(error.message, 400);
    await bestEffortActivity({
      customerId,
      actorUserId: auth.actor.user.id,
      activityType: enabled ? "portal_enabled" : "portal_disabled",
      title: enabled ? "Dealer portal enabled" : "Dealer portal disabled",
    });
    return Response.json({ ok: true, portal_enabled: enabled });
  }

  if (!isUuid(body.portal_user_id)) return jsonError("A valid portal user is required.", 400);
  const portalUserId = body.portal_user_id;
  const portalUser = await getPortalUser(customerId, portalUserId);
  if (!portalUser) return jsonError("Portal user not found for this customer.", 404);

  if (action === "set_primary") {
    const { error: clearError } = await supabaseAdmin
      .from("customer_portal_users")
      .update({ is_primary: false, updated_by: auth.actor.user.id })
      .eq("customer_id", customerId)
      .eq("is_primary", true);
    if (clearError) return jsonError(clearError.message, 400);
    const { error } = await supabaseAdmin
      .from("customer_portal_users")
      .update({ is_primary: true, updated_by: auth.actor.user.id })
      .eq("id", portalUserId)
      .eq("customer_id", customerId);
    if (error) return jsonError(error.message, 400);
    await bestEffortActivity({ customerId, actorUserId: auth.actor.user.id, activityType: "portal_primary_changed", title: "Primary dealer portal user changed", portalUserId });
    return Response.json({ ok: true });
  }

  if (action === "suspend") {
    if (portalUser.status === "suspended") return Response.json({ ok: true });
    const { error } = await supabaseAdmin
      .from("customer_portal_users")
      .update({ status: "suspended", updated_by: auth.actor.user.id })
      .eq("id", portalUserId)
      .eq("customer_id", customerId);
    if (error) return jsonError(error.message, 400);
    await bestEffortActivity({ customerId, actorUserId: auth.actor.user.id, activityType: "portal_user_suspended", title: "Dealer portal user suspended", description: portalUser.login_email, portalUserId });
    return Response.json({ ok: true });
  }

  if (action === "restore") {
    if (portalUser.status !== "suspended") return jsonError("Only suspended portal users can be restored.", 409);
    const restoredStatus = portalUser.activated_at
      ? "active"
      : portalUser.invited_at && portalUser.auth_user_id
        ? "invited"
        : "never_invited";
    const { error } = await supabaseAdmin
      .from("customer_portal_users")
      .update({ status: restoredStatus, updated_by: auth.actor.user.id })
      .eq("id", portalUserId)
      .eq("customer_id", customerId);
    if (error) return jsonError(error.message, 400);
    await bestEffortActivity({ customerId, actorUserId: auth.actor.user.id, activityType: "portal_user_restored", title: "Dealer portal user restored", description: portalUser.login_email, portalUserId });
    return Response.json({ ok: true, status: restoredStatus });
  }

  if (action === "invite" || action === "resend_invite") {
    if (!customer.portal_enabled) return jsonError("Enable the customer portal before sending an invitation.", 409);

    const isResend = action === "resend_invite";
    if (isResend && portalUser.status !== "invited") return jsonError("Only pending invitations can be resent.", 409);
    if (!isResend && (portalUser.status !== "never_invited" || portalUser.auth_user_id)) {
      return jsonError("This portal user has already entered the invitation lifecycle.", 409);
    }

    let createdAuthUserId: string | null = null;
    let authUserId = portalUser.auth_user_id;

    try {
      if (isResend) {
        const existingAuth = await validateLinkedDealerAuth(portalUser);
        authUserId = existingAuth.id;
      } else {
        const authUser = await ensureDealerAuthUser(portalUser);
        createdAuthUserId = authUser.id;
        authUserId = authUser.id;
      }

      if (!authUserId) throw new Error("Dealer Auth account is missing.");
      const activationLink = await generateActivationLink(portalUser.login_email);
      const now = new Date().toISOString();

      const { error: bindError } = await supabaseAdmin
        .from("customer_portal_users")
        .update({
          auth_user_id: authUserId,
          status: "invited",
          invited_at: now,
          updated_by: auth.actor.user.id,
        })
        .eq("id", portalUserId)
        .eq("customer_id", customerId);
      if (bindError) throw new Error(bindError.message);

      try {
        await sendDealerPortalInvite({
          to: portalUser.login_email,
          fullName: portalUser.full_name,
          customerName: customer.name,
          activationUrl: activationLink,
        });
      } catch (mailError) {
        if (createdAuthUserId) {
          await supabaseAdmin
            .from("customer_portal_users")
            .update({ auth_user_id: null, status: "never_invited", invited_at: null, updated_by: auth.actor.user.id })
            .eq("id", portalUserId)
            .eq("customer_id", customerId);
          await supabaseAdmin.auth.admin.deleteUser(createdAuthUserId).catch(() => undefined);
        }
        throw mailError;
      }

      await bestEffortActivity({
        customerId,
        actorUserId: auth.actor.user.id,
        activityType: isResend ? "portal_invite_resent" : "portal_user_invited",
        title: isResend ? "Dealer portal invitation resent" : "Dealer portal invitation sent",
        description: portalUser.login_email,
        portalUserId,
      });
      return Response.json({ ok: true, status: "invited" });
    } catch (error) {
      if (createdAuthUserId) {
        const latest = await getPortalUser(customerId, portalUserId);
        if (!latest?.auth_user_id) {
          await supabaseAdmin.auth.admin.deleteUser(createdAuthUserId).catch(() => undefined);
        }
      }
      return jsonError(error instanceof Error ? error.message : "Unable to send dealer invitation.", 400);
    }
  }

  return jsonError("Unsupported dealer portal action.", 400);
}

export async function DELETE(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;

  const url = new URL(request.url);
  const customerId = url.searchParams.get("customer_id");
  const portalUserId = url.searchParams.get("portal_user_id");
  if (!isUuid(customerId) || !isUuid(portalUserId)) return jsonError("A valid customer and portal user are required.", 400);

  const portalUser = await getPortalUser(customerId, portalUserId);
  if (!portalUser) return jsonError("Portal user not found for this customer.", 404);
  if (portalUser.status !== "never_invited" || portalUser.auth_user_id) {
    return jsonError("Invited portal users must be suspended instead of deleted.", 409);
  }

  const { error } = await supabaseAdmin
    .from("customer_portal_users")
    .delete()
    .eq("id", portalUserId)
    .eq("customer_id", customerId);
  if (error) return jsonError(error.message, 400);

  await bestEffortActivity({ customerId, actorUserId: auth.actor.user.id, activityType: "portal_user_removed", title: "Dealer portal draft user removed", description: portalUser.login_email, portalUserId });
  return Response.json({ ok: true });
}
