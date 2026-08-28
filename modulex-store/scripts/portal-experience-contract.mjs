import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));

assert.equal(exists("src/components/portal/PortalAuthShell.tsx"), true);
assert.equal(exists("src/components/portal/PortalShell.tsx"), true);
assert.equal(exists("src/components/portal/PortalNavigation.tsx"), true);
assert.equal(exists("src/app/portal.css"), true);

const themeToggle = read("src/components/ThemeToggle.tsx");
assert.match(themeToggle, /localStorage\.setItem\(["']theme["']/);
assert.doesNotMatch(themeToggle, /localStorage\.setItem\(["']oakwell-theme["']/);

for (const file of [
  "src/app/account/(auth)/login/page.tsx",
  "src/app/account/(auth)/forgot-password/page.tsx",
  "src/app/account/(auth)/reset-password/page.tsx",
  "src/app/account/activate/page.tsx",
  "src/app/dealer/(auth)/login/page.tsx",
  "src/app/dealer/(auth)/forgot-password/page.tsx",
  "src/app/dealer/(auth)/reset-password/page.tsx",
  "src/app/dealer/activate/page.tsx",
]) {
  assert.match(read(file), /PortalAuthShell/);
}

assert.match(read("src/app/account/(portal)/layout.tsx"), /PortalShell/);
assert.match(read("src/app/dealer/(portal)/layout.tsx"), /PortalShell/);

console.log("P1.5 portal experience contract PASS");
