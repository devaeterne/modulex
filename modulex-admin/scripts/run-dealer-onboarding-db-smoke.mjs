import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env"), override: false });

const databaseUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
const smokeFiles = [
  resolve(process.cwd(), "tests/smoke/dealer-onboarding.smoke.sql"),
  resolve(process.cwd(), "tests/smoke/dealer-lifecycle-privacy.smoke.sql"),
];

if (!databaseUrl) {
  console.error("\nMissing SUPABASE_DB_URL (or DATABASE_URL).\n");
  process.exit(2);
}

for (const smokeFile of smokeFiles) {
  if (!existsSync(smokeFile)) {
    console.error(`Smoke SQL file not found: ${smokeFile}`);
    process.exit(2);
  }

  const child = spawnSync(
    "psql",
    [databaseUrl, "-X", "-v", "ON_ERROR_STOP=1", "-f", smokeFile],
    { stdio: "inherit", env: process.env }
  );

  if (child.error) {
    if (child.error.code === "ENOENT") {
      console.error("\npsql is not installed or is not available in PATH.");
    } else {
      console.error(child.error);
    }
    process.exit(2);
  }

  if ((child.status ?? 1) !== 0) {
    process.exit(child.status ?? 1);
  }
}
