import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const adminKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

assert.ok(url, "NEXT_PUBLIC_SUPABASE_URL is required");
assert.ok(publishableKey, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required");
assert.ok(adminKey, "SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY is required");

const admin = createClient(url, adminKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const initialPassword = `P1.3-${crypto.randomUUID()}-Aa1!`;
const resetPassword = `P1.3-reset-${crypto.randomUUID()}-Bb2!`;
const createdUserIds = [];
const createdPortalUserIds = [];
const createdCustomerIds = [];

function emailFor(name) {
  return `p13-${name}-${runId}@example.com`;
}

function publicClient() {
  return createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function createAuthUser(name, appMetadata) {
  const email = emailFor(name);
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: initialPassword,
    email_confirm: true,
    app_metadata: appMetadata,
  });
  if (error || !data.user) throw new Error(error?.message || `Unable to create ${name} Auth fixture`);
  createdUserIds.push(data.user.id);
  return { id: data.user.id, email };
}

async function createCustomer(name, portalEnabled) {
  const customerCode = `P13-${name.toUpperCase()}-${runId}`.slice(0, 48);
  const { data, error } = await admin
    .from("customers")
    .insert({
      customer_code: customerCode,
      name: `P1.3 ${name} Live Smoke`,
      status: "active",
      portal_enabled: portalEnabled,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message || `Unable to create ${name} customer fixture`);
  createdCustomerIds.push(data.id);
  return { id: data.id, customerCode };
}

async function linkDealer(user, customer, status) {
  const { data, error } = await admin
    .from("customer_portal_users")
    .insert({
      customer_id: customer.id,
      auth_user_id: user.id,
      login_email: user.email,
      portal_role: "buyer",
      status,
      is_primary: true,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message || "Unable to create portal user fixture");
  createdPortalUserIds.push(data.id);
  return data.id;
}

async function signInAndContext(email, password = initialPassword) {
  const client = publicClient();
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;

  const { data: claimData, error: claimError } = await client.auth.getClaims();
  if (claimError) throw claimError;

  const { data: context, error: contextError } = await client.rpc("get_store_dealer_portal_context");
  if (contextError) throw contextError;

  await client.auth.signOut({ scope: "local" });
  return { claims: claimData.claims, context };
}

async function recoverySession(email) {
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: "https://oakwell-phi.vercel.app/dealer/reset-password" },
  });
  if (linkError || !linkData?.properties?.action_link) {
    throw new Error(linkError?.message || "Unable to generate recovery fixture link");
  }

  const action = new URL(linkData.properties.action_link);
  const tokenHash = action.searchParams.get("token");
  assert.ok(tokenHash, "generated recovery link must contain a token hash");

  const client = publicClient();
  const { data: verified, error: verifyError } = await client.auth.verifyOtp({
    token_hash: tokenHash,
    type: "recovery",
  });
  if (verifyError || !verified.user) throw new Error(verifyError?.message || "Unable to verify recovery fixture");

  const { data: context, error: contextError } = await client.rpc("get_store_dealer_portal_context");
  if (contextError) throw contextError;

  return {
    client,
    accountType: verified.user.app_metadata?.account_type,
    context,
  };
}

async function assertNoDatabaseFixtures() {
  if (createdPortalUserIds.length) {
    const { count, error } = await admin
      .from("customer_portal_users")
      .select("id", { count: "exact", head: true })
      .in("id", createdPortalUserIds);
    if (error) throw error;
    assert.equal(count, 0, "portal user fixtures must be removed");
  }

  if (createdCustomerIds.length) {
    const { count, error } = await admin
      .from("customers")
      .select("id", { count: "exact", head: true })
      .in("id", createdCustomerIds);
    if (error) throw error;
    assert.equal(count, 0, "customer fixtures must be removed");
  }
}

async function cleanup() {
  const failures = [];

  if (createdPortalUserIds.length) {
    const { error } = await admin.from("customer_portal_users").delete().in("id", createdPortalUserIds);
    if (error) failures.push(`portal cleanup: ${error.message}`);
  }

  if (createdCustomerIds.length) {
    const { error } = await admin.from("customers").delete().in("id", createdCustomerIds);
    if (error) failures.push(`customer cleanup: ${error.message}`);
  }

  for (const userId of createdUserIds) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) failures.push(`Auth cleanup ${userId}: ${error.message}`);
  }

  try {
    await assertNoDatabaseFixtures();
  } catch (error) {
    failures.push(`database cleanup verification: ${error instanceof Error ? error.message : String(error)}`);
  }

  for (const userId of createdUserIds) {
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (!error && data.user) failures.push(`Auth fixture still exists: ${userId}`);
  }

  if (failures.length) {
    throw new Error(`Live smoke cleanup failed: ${failures.join("; ")}`);
  }
}

try {
  const active = await createAuthUser("active", { account_type: "dealer_portal" });
  const suspended = await createAuthUser("suspended", { account_type: "dealer_portal" });
  const disabled = await createAuthUser("disabled", { account_type: "dealer_portal" });
  const internal = await createAuthUser("internal", { account_type: "internal_smoke" });

  const activeCustomer = await createCustomer("active", true);
  const suspendedCustomer = await createCustomer("suspended", true);
  const disabledCustomer = await createCustomer("disabled", false);

  await linkDealer(active, activeCustomer, "active");
  await linkDealer(suspended, suspendedCustomer, "suspended");
  await linkDealer(disabled, disabledCustomer, "active");

  const activeResult = await signInAndContext(active.email);
  assert.equal(activeResult.claims?.app_metadata?.account_type, "dealer_portal");
  assert.equal(activeResult.context?.ok, true);
  assert.equal(activeResult.context?.customer_id, activeCustomer.id);

  const suspendedResult = await signInAndContext(suspended.email);
  const disabledResult = await signInAndContext(disabled.email);
  const internalResult = await signInAndContext(internal.email);
  assert.deepEqual(suspendedResult.context, { ok: false, reason: "portal_access_denied" });
  assert.deepEqual(disabledResult.context, { ok: false, reason: "portal_access_denied" });
  assert.deepEqual(internalResult.context, { ok: false, reason: "portal_access_denied" });
  assert.notEqual(internalResult.claims?.app_metadata?.account_type, "dealer_portal");

  const activeRecovery = await recoverySession(active.email);
  assert.equal(activeRecovery.accountType, "dealer_portal");
  assert.equal(activeRecovery.context?.ok, true);
  const { error: passwordUpdateError } = await activeRecovery.client.auth.updateUser({ password: resetPassword });
  if (passwordUpdateError) throw passwordUpdateError;
  await activeRecovery.client.auth.signOut({ scope: "global" });

  const resetLogin = await signInAndContext(active.email, resetPassword);
  assert.equal(resetLogin.context?.ok, true, "active Dealer must sign in with the reset password");

  for (const fixture of [suspended, disabled]) {
    const recovery = await recoverySession(fixture.email);
    assert.equal(recovery.accountType, "dealer_portal");
    assert.deepEqual(recovery.context, { ok: false, reason: "portal_access_denied" });
    await recovery.client.auth.signOut({ scope: "local" });
  }

  const internalRecovery = await recoverySession(internal.email);
  assert.notEqual(internalRecovery.accountType, "dealer_portal");
  assert.deepEqual(internalRecovery.context, { ok: false, reason: "portal_access_denied" });
  await internalRecovery.client.auth.signOut({ scope: "local" });

  console.log("dealer portal live auth smoke: ok");
} finally {
  await cleanup();
}
