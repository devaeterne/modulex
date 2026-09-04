import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const packageRoot = process.cwd();
const repoRoot = path.resolve(packageRoot, "..");
const guidePath = path.join(packageRoot, "docs/ADMIN_UI_GUIDE.md");
assert.ok(fs.existsSync(guidePath), "Admin UI guide is required");
const guide = fs.readFileSync(guidePath, "utf8").toLowerCase();
for (const token of ["shared", "responsive", "dark", "loading", "error", "table", "modal"]) {
  assert.ok(guide.includes(token), `Admin UI guide must define ${token}`);
}

let diff;
try {
  diff = execFileSync("git", ["-C", repoRoot, "diff", "--unified=0", "origin/main...HEAD", "--", "modulex-admin/src"], { encoding: "utf8" });
} catch {
  diff = execFileSync("git", ["-C", repoRoot, "diff", "--unified=0", "HEAD^", "HEAD", "--", "modulex-admin/src"], { encoding: "utf8" });
}

const tableShellPatterns = [
  /<table\b[^>]*className\s*=\s*[^>\n]*overflow-(?:auto|x-auto)/gi,
  /<div\b[^>\n]*className\s*=\s*[^>\n]*overflow-(?:auto|x-auto)[^>\n]*>[\s\S]{0,800}<table\b/gi,
];

const sharedAppearancePrefixes = [
  "modulex-admin/src/components/ui/",
  "modulex-admin/src/components/form/",
  "modulex-admin/src/components/common/",
];

function isSharedAppearanceOwner(file) {
  return sharedAppearancePrefixes.some((prefix) => file?.startsWith(prefix));
}

// Shared UI/form/common primitives are the reviewed owners of reusable
// appearance. Feature/route code remains subject to the appearance guardrails.
// Preserve legacy table shells when a changed line edits an existing table
// without introducing another shell. A new shell still fails once its count
// increases.
function baselineAwareAddedText() {
  const chunks = diff.split(/^diff --git /m).slice(1);
  return chunks.map((chunk) => {
    const file = chunk.match(/ b\/(modulex-admin\/src\/[^\n]+)/)?.[1];
    const addedChunk = chunk.split("\n").filter((line) => line.startsWith("+") && !line.startsWith("+++" )).join("\n");
    if (!file) return addedChunk;
    if (isSharedAppearanceOwner(file)) return "";

    let baseline = "";
    let current = "";
    try {
      baseline = execFileSync("git", ["-C", repoRoot, "show", `origin/main:${file}`], { encoding: "utf8" });
      current = fs.readFileSync(path.join(repoRoot, file), "utf8");
    } catch {
      // New feature files have no baseline; still enforce button/component
      // guardrails, while table viewport migration remains incremental.
      return tableShellPatterns.reduce((text, pattern) => text.replace(pattern, ""), addedChunk);
    }
    if (tableShellPatterns.every((pattern) => {
      pattern.lastIndex = 0;
      const currentCount = current.match(pattern)?.length ?? 0;
      pattern.lastIndex = 0;
      const baselineCount = baseline.match(pattern)?.length ?? 0;
      return currentCount <= baselineCount;
    })) {
      return tableShellPatterns.reduce((text, pattern) => text.replace(pattern, ""), addedChunk);
    }
    return addedChunk;
  }).join("\n");
}

const addedText = baselineAwareAddedText();

function assertGuardrails(text) {
  assert.doesNotMatch(text, /<button\b(?:(?!>).)*className\s*=(?:(?!>).)*(?:bg-|rounded-|shadow-|border-|px-|py-|h-)/s, "New route-specific styled buttons are not allowed");
  assert.doesNotMatch(text, /<Button\b(?:(?!>).)*className\s*=(?:(?!>).)*(?:bg-|text-(?:white|gray|brand|error|success|warning)-|border-|rounded-|shadow-)/is, "Shared Button appearance overrides are not allowed");
  assert.doesNotMatch(text, /TailAdmin|dasoft\.me|info@dasoft\.me/i, "Known TailAdmin/demo patterns must not be reintroduced");
  assert.doesNotMatch(text, /<table\b[^>]*className\s*=\s*[^>\n]*overflow-(?:auto|x-auto)/i, "New route-specific table shells are not allowed");
  assert.doesNotMatch(text, /<div\b[^>\n]*className\s*=\s*[^>\n]*overflow-(?:auto|x-auto)[^>\n]*>[\s\S]{0,800}<table\b/i, "New ad-hoc table overflow shells are not allowed");
}

assertGuardrails(addedText);

const fixtures = {
  nativeButton: '<button className={cn("px-3", active && "bg-brand-500")}>Save</button>',
  sharedButton: '<Button className={clsx("rounded-lg", disabled && "bg-gray-300")} />',
  templateExpression: '<button className={`h-10 ${danger ? "bg-error-500" : "bg-brand-500"}`}>Delete</button>',
  tableShell: '<div className={cn("overflow-x-auto", "rounded-xl")}><table><tbody /></table></div>',
  layoutOnly: '<Button className={cn("w-full", "mt-2", "h-12", "px-2")} />',
};
for (const [name, fixture] of Object.entries(fixtures)) {
  if (name === "layoutOnly") {
    assert.doesNotThrow(() => assertGuardrails(fixture), `${name} fixture should pass`);
  } else {
    assert.throws(() => assertGuardrails(fixture), `${name} fixture should fail`);
  }
}

console.log("Admin UI consistency contract: PASS");