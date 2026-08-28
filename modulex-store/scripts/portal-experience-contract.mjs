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
assert.match(themeToggle, /localStorage\.getItem\(["']oakwell-theme["']/);
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

for (const file of [
  "src/app/account/(auth)/login/AccountLoginForm.tsx",
  "src/app/account/(auth)/forgot-password/AccountForgotPasswordForm.tsx",
  "src/app/account/(auth)/reset-password/AccountResetPasswordForm.tsx",
  "src/app/account/activate/AccountActivationForm.tsx",
  "src/app/dealer/(auth)/login/DealerLoginForm.tsx",
  "src/app/dealer/(auth)/forgot-password/DealerForgotPasswordForm.tsx",
  "src/app/dealer/(auth)/reset-password/DealerResetPasswordForm.tsx",
  "src/app/dealer/activate/DealerActivationForm.tsx",
]) {
  const source = read(file);
  assert.match(source, /portal-input/, `${file} must use Oakwell portal inputs`);
  assert.match(source, /portal-button--primary/, `${file} must use Oakwell portal buttons`);
  assert.doesNotMatch(source, /className=["'][^"']*\bform-control\b/, `${file} must not rely on Bootstrap form-control`);
}

const storeChrome = read("src/components/StoreChrome.tsx");
assert.match(storeChrome, /pathname\.startsWith\(["']\/account\/["']\)/, "all account routes must use standalone portal chrome");
assert.match(storeChrome, /pathname\.startsWith\(["']\/dealer\/["']\)/, "all dealer routes must use standalone portal chrome");

for (const file of [
  "src/app/account/(portal)/layout.tsx",
  "src/app/dealer/(portal)/layout.tsx",
]) {
  const source = read(file);
  assert.match(source, /PortalShell/);
  assert.doesNotMatch(source, /bg-light|bg-white/);
}

for (const file of [
  "src/components/portal/PortalOrderList.tsx",
  "src/components/portal/PortalOrderDetail.tsx",
]) {
  assert.match(read(file), /portal-/);
}

console.log("P1.5 portal experience contract PASS");
