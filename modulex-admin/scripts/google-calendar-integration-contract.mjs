import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  try {
    return await readFile(path.join(root, relativePath), "utf8");
  } catch (error) {
    assert.fail(`Required Google Calendar integration file is missing: ${relativePath}`);
  }
}

const [configSource, cryptoSource, templateSource, authSource, envSource] = await Promise.all([
  source("src/lib/google-calendar/config.ts"),
  source("src/lib/google-calendar/crypto.ts"),
  source("src/lib/google-calendar/template.ts"),
  source("src/lib/auth/admin-api.ts"),
  source(".env.example"),
]);

assert.match(configSource, /GOOGLE_CALENDAR_CLIENT_ID/);
assert.match(configSource, /GOOGLE_CALENDAR_CLIENT_SECRET/);
assert.match(configSource, /GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY/);
assert.match(configSource, /calendar\.app\.created/);
assert.match(configSource, /openid/);
assert.match(configSource, /email/);
assert.match(cryptoSource, /aes-256-gcm/);
assert.match(cryptoSource, /randomBytes\(12\)/);
assert.match(templateSource, /project_no/);
assert.match(templateSource, /project_name/);
assert.match(templateSource, /customer_name/);
assert.match(authSource, /requirePermission/);
assert.match(envSource, /GOOGLE_CALENDAR_CLIENT_ID=/);
assert.match(envSource, /GOOGLE_CALENDAR_CLIENT_SECRET=/);
assert.match(envSource, /GOOGLE_CALENDAR_REDIRECT_URI=/);
assert.match(envSource, /GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY=/);

console.log("Google Calendar integration foundation contract passed.");
