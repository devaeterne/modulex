import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const srcRoot = path.join(root, "src");

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(absolute));
    else if (/\.(?:tsx?|jsx?)$/.test(entry.name)) files.push(absolute);
  }
  return files;
}

const sourceFiles = await walk(srcRoot);
const iconUsages = [];
for (const absolute of sourceFiles) {
  const source = await readFile(absolute, "utf8");
  const relative = path.relative(root, absolute).replaceAll(path.sep, "/");
  for (const match of source.matchAll(/\bbi(?:\s+bi-[a-z0-9-]+|-[a-z0-9-]+)/gi)) {
    iconUsages.push(`${relative}: ${match[0]}`);
  }
}

if (iconUsages.length) {
  console.log("GC-8B Bootstrap icon inventory:\n" + iconUsages.join("\n"));
}

const homeCriticalFiles = new Set([
  "src/app/page.tsx",
  "src/components/BackToTop.tsx",
  "src/components/ThemeToggle.tsx",
  "src/components/Footer.tsx",
  "src/components/GalleryLightbox.tsx",
]);
const criticalIconUsages = iconUsages.filter((usage) => homeCriticalFiles.has(usage.split(": ")[0]));
assert.equal(
  criticalIconUsages.length,
  0,
  `Home critical rendering path must not depend on the 128 KiB Bootstrap icon font:\n${criticalIconUsages.join("\n")}`,
);

const style = await readFile(path.join(srcRoot, "css/style.css"), "utf8");
assert.doesNotMatch(
  style,
  /@import\s+url\(["']?https:\/\/fonts\.googleapis\.com/i,
  "Primary stylesheet must not create a render-blocking Google Fonts @import chain",
);

console.log("GC-8B performance delivery contract: PASS");
