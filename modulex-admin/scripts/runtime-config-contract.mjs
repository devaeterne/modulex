import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const readJson = (file) => JSON.parse(read(file));
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

function sourceFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...sourceFiles(absolute));
    else if (/\.(?:[cm]?[jt]sx?)$/.test(entry.name)) files.push(absolute);
  }
  return files;
}

const pkg = readJson("package.json");
const lock = readJson("package-lock.json");
const gitignore = read(".gitignore");
const envExample = read(".env.example");
const browserClient = read("src/lib/supabase/client.ts");
const serverAdmin = read("src/lib/supabase/server-admin.ts");
const dealerPortalEmail = read("src/lib/email/dealer-portal.ts");
const dealerPortalRoute = read("src/app/api/admin/dealer-portal/route.ts");
const storeOrigin = read("src/lib/runtime/store-origin.ts");
const runtimeDocPath = path.join(root, "docs/ADMIN_RUNTIME_CONFIG.md");

assert(pkg.name === "modulex-admin", `package.json name must be modulex-admin, got ${pkg.name}`);
assert(lock.name === "modulex-admin", `package-lock.json name must be modulex-admin, got ${lock.name}`);
assert(lock.packages?.[""]?.name === "modulex-admin", "package-lock root package name must be modulex-admin");

assert(gitignore.split(/\r?\n/).includes(".env*"), ".gitignore must ignore all .env* files");
assert(gitignore.split(/\r?\n/).includes("!.env.example"), ".gitignore must explicitly keep .env.example tracked");

const allowedPublicEnv = new Set([
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_STORE_URL",
]);

const envLines = envExample
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#") && line.includes("="));

for (const line of envLines) {
  const [key, ...rest] = line.split("=");
  const value = rest.join("=").trim();
  assert(value === "", `.env.example must not contain a concrete value for ${key}`);
  if (key.startsWith("NEXT_PUBLIC_")) {
    assert(allowedPublicEnv.has(key), `${key} is not in the browser-safe NEXT_PUBLIC_ allowlist`);
  }
}

for (const required of [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_STORE_URL",
  "STORE_SITE_URL",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "RESEND_API_KEY",
  "SUPABASE_DB_URL",
  "SMOKE_TEST_EMAIL",
  "SMOKE_TEST_PASSWORD",
]) {
  assert(envLines.some((line) => line.startsWith(`${required}=`)), `.env.example must document ${required}`);
}

const sourceRoot = path.join(root, "src");
for (const file of sourceFiles(sourceRoot)) {
  const source = fs.readFileSync(file, "utf8");
  const relative = path.relative(root, file);
  for (const key of source.match(/\bNEXT_PUBLIC_[A-Z0-9_]+\b/g) ?? []) {
    assert(allowedPublicEnv.has(key), `${relative} references non-allowlisted public env ${key}`);
  }
}

assert(browserClient.includes("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"), "browser Supabase client must use the publishable key");
assert(!browserClient.includes("SUPABASE_SECRET_KEY"), "browser Supabase client must not reference SUPABASE_SECRET_KEY");
assert(!browserClient.includes("SUPABASE_SERVICE_ROLE_KEY"), "browser Supabase client must not reference SUPABASE_SERVICE_ROLE_KEY");

assert(serverAdmin.includes('import "server-only";'), "elevated Supabase client must be server-only");
const modernSecretIndex = serverAdmin.indexOf("SUPABASE_SECRET_KEY");
const legacySecretIndex = serverAdmin.indexOf("SUPABASE_SERVICE_ROLE_KEY");
assert(modernSecretIndex >= 0, "server Admin client must support SUPABASE_SECRET_KEY");
assert(legacySecretIndex >= 0, "server Admin client must retain the documented legacy service-role fallback");
assert(modernSecretIndex < legacySecretIndex, "SUPABASE_SECRET_KEY must be preferred before the legacy service-role fallback");

assert(storeOrigin.includes('import "server-only";'), "Store origin resolver must be server-only");
assert(storeOrigin.includes("STORE_SITE_URL"), "Store origin resolver must support STORE_SITE_URL");
assert(storeOrigin.includes("NEXT_PUBLIC_STORE_URL"), "Store origin resolver must retain NEXT_PUBLIC_STORE_URL compatibility");
assert(!storeOrigin.includes("oakwell-phi.vercel.app"), "Store origin resolver must not hardcode the legacy Vercel hostname");
assert(dealerPortalEmail.includes("getStoreActivationUrl"), "dealer portal email must use the controlled Store activation origin helper");
assert(dealerPortalRoute.includes("getStoreActivationUrl"), "dealer portal API must use the controlled Store activation origin helper");
assert(!dealerPortalEmail.includes("oakwell-phi.vercel.app"), "dealer portal email must not hardcode the legacy Vercel hostname");
assert(!dealerPortalRoute.includes("oakwell-phi.vercel.app"), "dealer portal API must not hardcode the legacy Vercel hostname");

assert(pkg.scripts?.["smoke:runtime-config"] === "node scripts/runtime-config-contract.mjs", "package.json must expose smoke:runtime-config");
assert(pkg.scripts?.smoke?.includes("smoke:runtime-config"), "main smoke chain must include smoke:runtime-config");

assert(fs.existsSync(runtimeDocPath), "docs/ADMIN_RUNTIME_CONFIG.md must document the runtime contract");
const runtimeDoc = fs.existsSync(runtimeDocPath) ? fs.readFileSync(runtimeDocPath, "utf8") : "";
for (const requiredText of [
  "Vercel project: `modulex`",
  "Root directory: `modulex-admin`",
  "Production branch: `main`",
  "configuration-owned",
  "STORE_SITE_URL",
  "NEXT_PUBLIC_STORE_URL",
  "SUPABASE_SECRET_KEY",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "strict browser-safe allowlist",
]) {
  assert(runtimeDoc.includes(requiredText), `runtime config documentation must include: ${requiredText}`);
}

console.log("Runtime/config contract passed.");
