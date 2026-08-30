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
const added = diff.split("\n").filter((line) => line.startsWith("+") && !line.startsWith("+++"));
const addedText = added.join("\n");

assert.doesNotMatch(addedText, /<button\b[^>]*className=["'`][^"'`]*(?:bg-|rounded-|shadow-|border-|px-|py-|h-)/i, "New route-specific styled buttons are not allowed");
assert.doesNotMatch(addedText, /<Button\b[^>]*className=["'`][^"'`]*(?:bg-|text-(?:white|gray|brand|error|success|warning)-|border-|rounded-|shadow-|px-|py-|h-)/i, "Shared Button appearance overrides are not allowed");
assert.doesNotMatch(addedText, /TailAdmin|dasoft\.me|info@dasoft\.me/i, "Known TailAdmin/demo patterns must not be reintroduced");
assert.doesNotMatch(addedText, /<table[^>]*className=["'`][^"'`]*overflow-(?:auto|x-auto)/i, "New route-specific table shells are not allowed");

console.log("Admin UI consistency contract: PASS");
