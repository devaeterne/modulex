import assert from "node:assert/strict";
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(repoRoot, "docs/acceptance/us-date-format-audit.json");

const roots = [
  { scope: "admin", relative: "modulex-admin/src" },
  { scope: "store", relative: "modulex-store/src" },
];

const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx"]);
const approvedSharedPaths = new Set([
  "modulex-admin/src/lib/dates/usDate.ts",
  "modulex-store/src/lib/dates/usDate.ts",
  "modulex-admin/src/components/form/DateInput.tsx",
]);

const cases = [
  ['<Input type="date" />', 'native-date-input'],
  ['<input type="date" />', 'native-date-input'],
  ['value.toLocaleDateString()', 'locale-date-display'],
  ['updatedAt.toLocaleString()', 'locale-date-display'],
  ['new Date(value).toLocaleString()', 'locale-date-display'],
  ['new Intl.DateTimeFormat(undefined, { dateStyle: "medium" })', 'intl-date-display'],
  ['placeholder="dd.mm.yyyy"', 'date-placeholder'],
  ['placeholder="yyyy-mm-dd"', 'date-placeholder'],
];

function normalizePath(value) {
  return value.split(path.sep).join("/");
}

function isPresentationPath(relativePath) {
  const normalized = normalizePath(relativePath);
  if (normalized.includes("/src/components/")) return true;
  if (normalized.includes("/src/app/") && !normalized.includes("/src/app/api/")) return true;
  return false;
}

function looksLikeDateReceiver(line) {
  return /(?:date|time|timestamp|created|updated|issued|expire|due|start|end|paid|posted|received|scheduled|submitted|completed|observed|generated|last[A-Z_]|_at\b|At\b)[\w?.]*\.toLocaleString\s*\(/i.test(line);
}

function classifyLine(line, relativePath = "modulex-admin/src/components/example.tsx") {
  const categories = new Set();
  const presentation = isPresentationPath(relativePath);

  if (/(?:\btype\s*=\s*["']date["']|\btype\s*:\s*["']date["'])/.test(line)) {
    categories.add("native-date-input");
  }
  if (presentation && /\.toLocaleDateString\s*\(/.test(line)) {
    categories.add("locale-date-display");
  }
  if (presentation && (/\bnew\s+Date\s*\([^)]*\)\.toLocaleString\s*\(/.test(line) || looksLikeDateReceiver(line))) {
    categories.add("locale-date-display");
  }
  if (presentation && /\bIntl\.DateTimeFormat\s*\(/.test(line)) {
    categories.add("intl-date-display");
  }
  if (
    /placeholder\s*=\s*["'][^"']*(?:dd[.\/-]mm[.\/-]yyyy|yyyy[.\/-]mm[.\/-]dd|mm[\/-]dd[\/-]yyyy)[^"']*["']/i.test(line) ||
    /dateFormat\s*:\s*["']Y-m-d["']/.test(line)
  ) {
    categories.add("date-placeholder");
  }

  return [...categories];
}

function shouldScanPath(relativePath) {
  const normalized = normalizePath(relativePath);
  if (approvedSharedPaths.has(normalized)) return false;
  if (normalized.includes("/node_modules/") || normalized.includes("/.next/")) return false;
  if (normalized.includes("/supabase/migrations/") || normalized.endsWith("package-lock.json")) return false;
  if (normalized.includes("/__tests__/") || /\.(?:test|spec)\.[jt]sx?$/.test(normalized)) return false;
  return sourceExtensions.has(path.extname(normalized));
}

async function walkDirectory(absoluteRoot, relativeRoot) {
  const findings = [];
  const entries = await readdir(absoluteRoot, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = path.join(absoluteRoot, entry.name);
    const relativePath = normalizePath(path.join(relativeRoot, entry.name));
    if (entry.isDirectory()) {
      if (["node_modules", ".next", "dist", "build"].includes(entry.name)) continue;
      findings.push(...await walkDirectory(absolutePath, relativePath));
      continue;
    }
    if (!entry.isFile() || !shouldScanPath(relativePath)) continue;

    const source = await readFile(absolutePath, "utf8");
    const lines = source.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const snippet = lines[index].trim();
      if (!snippet) continue;
      for (const category of classifyLine(lines[index], relativePath)) {
        findings.push({
          path: relativePath,
          line: index + 1,
          category,
          snippet,
        });
      }
    }
  }

  return findings;
}

function signature(finding) {
  return `${finding.path}|${finding.category}|${finding.snippet.trim()}`;
}

async function loadExistingManifest() {
  try {
    return JSON.parse(await readFile(manifestPath, "utf8"));
  } catch {
    return null;
  }
}

function annotationMap(manifest) {
  const map = new Map();
  if (!manifest) return map;
  for (const scope of ["admin", "store"]) {
    for (const finding of manifest?.[scope]?.findings ?? []) {
      map.set(signature(finding), {
        semantic: finding.semantic,
        reason: finding.reason,
      });
    }
  }
  return map;
}

async function scan() {
  const result = { admin: [], store: [] };
  for (const root of roots) {
    result[root.scope] = await walkDirectory(path.join(repoRoot, root.relative), root.relative);
    result[root.scope].sort((left, right) =>
      left.path.localeCompare(right.path) || left.line - right.line || left.category.localeCompare(right.category));
  }
  return result;
}

async function writeManifest() {
  const existing = await loadExistingManifest();
  const annotations = annotationMap(existing);
  const scanned = await scan();
  const manifest = {
    generated_at: new Date().toISOString(),
    admin: { findings: [] },
    store: { findings: [] },
  };

  for (const scope of ["admin", "store"]) {
    manifest[scope].findings = scanned[scope].map((finding) => {
      const annotation = annotations.get(signature(finding));
      return {
        ...finding,
        ...(annotation?.semantic ? { semantic: annotation.semantic } : {}),
        ...(annotation?.reason ? { reason: annotation.reason } : {}),
      };
    });
  }

  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`Wrote ${path.relative(repoRoot, manifestPath)} (${manifest.admin.findings.length} admin, ${manifest.store.findings.length} store findings).`);
}

function scopeFromArgs(argv) {
  const index = argv.indexOf("--scope");
  if (index === -1) return "all";
  const value = argv[index + 1];
  if (!["admin", "store", "all"].includes(value)) throw new Error("--scope must be admin, store, or all.");
  return value;
}

async function checkManifest(scope) {
  const existing = await loadExistingManifest();
  if (!existing) throw new Error("Date audit manifest is missing. Run --write first.");
  const annotations = annotationMap(existing);
  const scanned = await scan();
  const scopes = scope === "all" ? ["admin", "store"] : [scope];
  const unresolved = [];

  for (const currentScope of scopes) {
    for (const finding of scanned[currentScope]) {
      const annotation = annotations.get(signature(finding));
      const explicitlyInternal = annotation?.semantic === "non-presentation" && Boolean(annotation?.reason?.trim());
      if (!explicitlyInternal) unresolved.push({ scope: currentScope, ...finding });
    }
  }

  if (unresolved.length) {
    console.error(`US date audit found ${unresolved.length} unresolved human-facing/internal-unclassified finding(s):`);
    for (const finding of unresolved) {
      console.error(`- [${finding.scope}] ${finding.path}:${finding.line} ${finding.category} :: ${finding.snippet}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`PASS: US date format audit (${scope})`);
}

function runSelfTest() {
  for (const [source, expected] of cases) {
    assert.ok(classifyLine(source).includes(expected), `${expected} was not detected for ${source}`);
  }
  assert.deepEqual(classifyLine("amount.toLocaleString()"), [], "numeric locale formatting must not be treated as a date violation");
  assert.deepEqual(
    classifyLine("new Date(value).toISOString()", "modulex-admin/src/lib/example.ts"),
    [],
    "canonical/internal Date construction must not be treated as a presentation violation",
  );

  for (const excluded of [
    "modulex-store/supabase/migrations/20260907000000_example.sql",
    "modulex-admin/.next/server/app.js",
    "modulex-admin/node_modules/example/index.js",
    "modulex-admin/package-lock.json",
    "modulex-admin/src/example/__tests__/canonical-date.test.ts",
    "modulex-admin/src/lib/dates/usDate.ts",
    "modulex-store/src/lib/dates/usDate.ts",
    "modulex-admin/src/components/form/DateInput.tsx",
  ]) {
    assert.equal(shouldScanPath(excluded), false, `${excluded} should be excluded`);
  }

  assert.equal(shouldScanPath("modulex-admin/src/app/example/page.tsx"), true);
  assert.equal(shouldScanPath("modulex-store/src/app/account/page.tsx"), true);
  console.log("PASS: US date audit scanner self-test");
}

const argv = process.argv.slice(2);
const args = new Set(argv);

if (args.has("--self-test")) {
  runSelfTest();
} else if (args.has("--write")) {
  await writeManifest();
} else if (args.has("--check")) {
  await checkManifest(scopeFromArgs(argv));
} else {
  throw new Error("Use --self-test, --write, or --check [--scope admin|store|all].");
}
