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

assert.equal(
  iconUsages.length,
  0,
  `Store source must not depend on the 128 KiB Bootstrap icon font:\n${iconUsages.join("\n")}`,
);

const [style, layout] = await Promise.all([
  readFile(path.join(srcRoot, "css/style.css"), "utf8"),
  readFile(path.join(srcRoot, "app/layout.tsx"), "utf8"),
]);

assert.doesNotMatch(style, /fonts\.googleapis\.com/i, "Primary stylesheet must not reference Google Fonts CSS");
assert.doesNotMatch(style, /display=swap['"]?\);?/i, "Primary stylesheet must not retain a partial Google Fonts import fragment");
assert.doesNotMatch(style, /font-family:\s*['"](?:Outfit|Playfair Display)['"]/i, "Legacy external font-family declarations must be replaced by Next font variables");
assert.match(style, /font-family:\s*var\(--font-outfit\)/, "Body typography must use the optimized Outfit variable");
assert.match(style, /font-family:\s*var\(--font-playfair\)/, "Display typography must use the optimized Playfair variable");
assert.match(layout, /from\s+["']next\/font\/google["']/, "Root layout must use next/font for self-hosted Google font delivery");
assert.match(layout, /--font-outfit/, "Root layout must expose the Outfit CSS variable");
assert.match(layout, /--font-playfair/, "Root layout must expose the Playfair CSS variable");
assert.doesNotMatch(layout, /bootstrap-icons\.css/, "Root layout must not load the Bootstrap Icons stylesheet");

console.log("GC-8B performance delivery contract: PASS");
