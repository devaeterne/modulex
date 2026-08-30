import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const resetForm = await readFile(path.join(root, "src/components/auth/ResetPasswordForm.tsx"), "utf8");
const forgotForm = await readFile(path.join(root, "src/components/auth/ForgotPasswordForm.tsx"), "utf8");
const usersRoute = await readFile(path.join(root, "src/app/api/admin/users/route.ts"), "utf8");

assert.match(forgotForm, /reset-password\?mode=recovery/, "Forgot-password recovery must mark the callback mode");
assert.match(usersRoute, /inviteUserByEmail[\s\S]*reset-password\?mode=invite/, "Admin invitations must mark the callback as an invite password setup");
assert.match(usersRoute, /resetPasswordForEmail[\s\S]*reset-password\?mode=recovery/, "Admin-triggered password resets must mark the callback as recovery");
assert.match(resetForm, /PasswordSetupType\s*=\s*["']recovery["']\s*\|\s*["']invite["']/, "Password setup must support both recovery and invite callback types");
assert.match(resetForm, /isPasswordSetupType\(type\)/, "Password setup must validate the Supabase callback type from the URL fragment");
assert.match(resetForm, /isPasswordSetupType\(mode\)/, "Password setup must validate the non-secret callback mode marker");
assert.match(resetForm, /verifyOtp/, "Token-hash password setup links must be explicitly verified");
assert.match(resetForm, /type:\s*(tokenType|callbackType)/, "Token-hash verification must preserve whether the link is invite or recovery");
assert.match(resetForm, /getSession/, "Implicit invite and recovery callbacks must accept the Supabase session");
assert.match(resetForm, /getUser/, "Password setup must validate the authenticated user");
assert.match(resetForm, /customer_portal/, "Admin password setup must reject Customer Portal identities");
assert.match(resetForm, /dealer_portal/, "Admin password setup must reject Dealer Portal identities");
assert.match(resetForm, /updateUser/, "Password setup must update the password only after callback validation");
assert.match(resetForm, /scope:\s*["']global["']/, "Successful password setup must globally sign out sessions");
assert.doesNotMatch(resetForm, /params\.get\(["']access_token["']\)/, "Password setup must not manually parse implicit access tokens");
assert.doesNotMatch(resetForm, /params\.get\(["']refresh_token["']\)/, "Password setup must not manually parse implicit refresh tokens");

console.log("auth password setup contract: ok");
