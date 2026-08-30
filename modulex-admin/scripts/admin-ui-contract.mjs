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

function assertGuardrails(text) {
  assert.doesNotMatch(text, /<button\b(?:(?!>).)*className\s*=(?:(?!>).)*(?:bg-|rounded-|shadow-|border-|px-|py-|h-)/is, "New route-specific styled buttons are not allowed");
  assert.doesNotMatch(text, /<Button\b(?:(?!>).)*className\s*=(?:(?!>).)*(?:bg-|text-(?:white|gray|brand|error|success|warning)-|border-|rounded-|shadow-|px-|py-|h-)/is, "Shared Button appearance overrides are not allowed");
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
  layoutOnly: '<Button className={cn("w-full", "mt-2")} />',
};
for (const [name, fixture] of Object.entries(fixtures)) {
  if (name === "layoutOnly") {
    assert.doesNotThrow(() => assertGuardrails(fixture), `${name} fixture should pass`);
  } else {
    assert.throws(() => assertGuardrails(fixture), `${name} fixture should fail`);
  }
}

console.log("Admin UI consistency contract: PASS");
