import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const form = await readFile(path.join(root, "src/components/auth/ResetPasswordForm.tsx"), "utf8");

assert.match(form, /window\.location\.hash/, "Admin recovery must receive the token from the URL fragment");
assert.match(form, /token_hash/, "Admin recovery must use the token hash");
assert.match(form, /history\.replaceState/, "Admin recovery must clear the credential from the browser address bar");
assert.match(form, /verifyOtp/, "Admin recovery must explicitly verify the recovery token");
assert.match(form, /type:\s*["']recovery["']/, "Admin recovery must verify the recovery token type");
assert.match(form, /account_type/, "Admin recovery must inspect trusted account metadata");
assert.match(form, /dealer_portal/, "Admin recovery must reject Dealer Portal identities");
assert.match(form, /updateUser/, "Admin recovery must update the password only after verification");
assert.match(form, /scope:\s*["']global["']/, "successful Admin recovery must globally sign out sessions");
assert.doesNotMatch(form, /window\.location\.search/, "recovery credentials must not be read from the query string");

console.log("auth recovery contract: ok");
