import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const resetForm = await readFile(path.join(root, "src/components/auth/ResetPasswordForm.tsx"), "utf8");
const forgotForm = await readFile(path.join(root, "src/components/auth/ForgotPasswordForm.tsx"), "utf8");

assert.match(forgotForm, /reset-password\?mode=recovery/, "Admin reset requests must mark the implicit recovery callback without putting credentials in the query string");
assert.match(resetForm, /window\.location\.hash/, "Admin recovery must continue to receive token-hash recovery credentials from the URL fragment");
assert.match(resetForm, /token_hash/, "Admin recovery must continue to support token-hash recovery links");
assert.match(resetForm, /window\.location\.search/, "Admin recovery must recognize the non-secret recovery callback marker");
assert.match(resetForm, /mode/, "Admin recovery must inspect the recovery callback marker");
assert.match(resetForm, /getSession/, "Admin recovery must accept the Supabase implicit recovery session after callback processing");
assert.match(resetForm, /PASSWORD_RECOVERY/, "Admin recovery must handle the Supabase password-recovery auth event");
assert.match(resetForm, /getUser/, "Admin recovery must validate the recovered user with Supabase Auth");
assert.match(resetForm, /history\.replaceState/, "Admin recovery must clear callback data from the browser address bar");
assert.match(resetForm, /verifyOtp/, "Admin recovery must explicitly verify token-hash recovery links");
assert.match(resetForm, /["']recovery["']/, "Admin recovery must preserve the recovery callback type");
assert.match(resetForm, /account_type/, "Admin recovery must inspect trusted account metadata");
assert.match(resetForm, /customer_portal/, "Admin recovery must reject Customer Portal identities");
assert.match(resetForm, /dealer_portal/, "Admin recovery must reject Dealer Portal identities");
assert.match(resetForm, /updateUser/, "Admin recovery must update the password only after recovery verification");
assert.match(resetForm, /scope:\s*["']global["']/, "successful Admin recovery must globally sign out sessions");
assert.doesNotMatch(resetForm, /params\.get\(["']access_token["']\)/, "Admin recovery must not manually parse implicit access tokens");
assert.doesNotMatch(resetForm, /params\.get\(["']refresh_token["']\)/, "Admin recovery must not manually parse implicit refresh tokens");

console.log("auth recovery contract: ok");
