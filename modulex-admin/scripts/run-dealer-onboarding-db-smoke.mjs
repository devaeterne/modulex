import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env"), override: false });

const databaseUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
const smokeFile = resolve(process.cwd(), "tests/smoke/dealer-onboarding.smoke.sql");

if (!databaseUrl) {
  console.error("\nMissing SUPABASE_DB_URL (or DATABASE_URL).\n");
  process.exit(2);
}

if (!existsSync(smokeFile)) {
  console.error(`Smoke SQL file not found: ${smokeFile}`);
  process.exit(2);
}

const child = spawn("psql", [databaseUrl, "-X", "-v", "ON_ERROR_STOP=1", "-f", smokeFile], {
  stdio: "inherit",
  env: process.env,
});

child.on("error", (error) => {
  if (error.code === "ENOENT") {
    console.error("\npsql is not installed or is not available in PATH.");
  } else {
    console.error(error);
  }
  process.exit(2);
});

child.on("exit", (code) => {
  process.exit(code ?? 1);
});
