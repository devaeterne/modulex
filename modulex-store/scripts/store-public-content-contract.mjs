import { access, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

async function readRequired(relativePath) {
  try {
    return await readFile(path.join(root, relativePath), "utf8");
  } catch {
    failures.push(`Expected file is missing: ${relativePath}`);
    return "";
  }
}

const querySource = await readRequired("src/lib/store/content/queries.ts");
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

const aboutSource = await readRequired("src/app/about/page.tsx");
if (aboutSource) {
  check(
    aboutSource.includes('getStorePublicPage("about")'),
    "About must read published CMS content through getStorePublicPage(\"about\")"
  );
  check(aboutSource.includes("generateMetadata"), "About must generate metadata from published CMS content");
  check(
    aboutSource.includes("getStorePublicCompanyProfile"),
    "About must keep the public company profile as the canonical company identity/contact source"
  );
  check(
    aboutSource.includes("Cabinet products and support from Oakwell Cabinetry"),
    "About must retain the production-safe factual fallback copy"
  );
  check(!aboutSource.includes("dangerouslySetInnerHTML"), "About CMS body must not render unsafe HTML");
}

if (failures.length > 0) {
  console.error("Store public content contract failed:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Store public content contract passed.");
