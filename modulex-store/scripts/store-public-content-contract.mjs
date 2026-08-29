import { access, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

const queryPath = path.join(root, "src/lib/store/content/queries.ts");
let querySource = "";
try {
  await access(queryPath);
  querySource = await readFile(queryPath, "utf8");
} catch {
  failures.push("Expected Store public content query module is missing: src/lib/store/content/queries.ts");
}

if (querySource) {
  for (const rpc of [
    "get_store_public_page",
    "get_store_public_projects",
    "get_store_public_project",
    "get_store_public_project_media",
  ]) {
    check(querySource.includes(`\"${rpc}\"`), `Public content query module must call ${rpc}`);
  }
  check(/revalidate:\s*900/.test(querySource), "Public content queries must use 900-second revalidation");
  check(!querySource.includes(".from("), "Public content query module must not directly read Supabase tables");
  check(querySource.includes("getStoreGalleryReadiness"), "Public content query module must expose getStoreGalleryReadiness");
  check(querySource.includes("import \"server-only\""), "Public content query module must remain server-only");
}

if (failures.length > 0) {
  console.error("Store public content contract failed:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Store public content contract passed.");
