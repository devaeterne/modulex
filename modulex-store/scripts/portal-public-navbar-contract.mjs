import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const storeChrome = read("src/components/StoreChrome.tsx");
assert.match(
  storeChrome,
  /if \(isDealerRoute \|\| isAccountRoute\) \{[\s\S]*?<Navbar[\s\S]*?<main>\{children\}<\/main>/,
  "portal routes must keep the public Oakwell navbar",
);

const portalShell = read("src/components/portal/PortalShell.tsx");
assert.doesNotMatch(
  portalShell,
  /portal-shell__header/,
  "PortalShell must not render a second competing top header",
);
assert.match(
  portalShell,
  /portal-shell__sidebar-account/,
  "portal identity and account controls must remain available in the sidebar",
);
assert.match(portalShell, /<ThemeToggle\s*\/>/);
assert.match(portalShell, /Sign out/);

console.log("Portal public navbar contract PASS");
