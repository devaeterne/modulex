import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const repoRoot = path.resolve(root, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const validation = read("src/lib/validation.ts");
const users = read("src/components/users/UsersTable.tsx");
const paymentMethods = read("src/components/customers/PaymentMethodsManager.tsx");
const taxRules = read("src/components/settings/TaxRulesSettings.tsx");
const company = read("src/components/settings/CompanyProfileSettings.tsx");
const localization = read("src/components/settings/LocalizationSettings.tsx");
const marketing = read("src/components/store/StoreMarketingSettings.tsx");
const pages = read("src/components/store/StorePageEditor.tsx");
const reviews = read("src/components/store/StoreReviewsManager.tsx");
const reviewDomain = read("src/lib/store/reviews.ts");
const packageJson = read("package.json");
const roadmap = fs.readFileSync(path.join(repoRoot, "modulex-admin/ADMIN_ROADMAP.md"), "utf8");

// Shared DB-contract primitives remain authoritative.
for (const helper of [
  "parseDbDecimal",
  "isValidEmail",
  "isValidPhone",
  "isValidCountryCode",
  "isValidCurrencyCode",
  "isValidHttpUrl",
]) {
  assert.match(validation, new RegExp(`export function ${helper}\\b`), `${helper} must remain a shared validation primitive`);
}

// numeric(7,3) payment/tax mutations must preserve exact strings rather than Number() truth.
for (const [source, name] of [
  [paymentMethods, "Payment Methods"],
  [taxRules, "Tax Rules"],
]) {
  assert.match(source, /parseDbDecimal\(/, `${name} must validate numeric(7,3) values with parseDbDecimal`);
  assert.match(source, /precision:\s*7[\s\S]*scale:\s*3[\s\S]*min:\s*0[\s\S]*max:\s*100/, `${name} must use the production numeric(7,3) 0..100 contract`);
}
assert.doesNotMatch(paymentMethods, /Number\(newCommission|Number\(method\.commission_percent/, "Payment Method commission mutation truth must not pass through Number()");
assert.match(paymentMethods, /commission_percent:\s*(?:parsed|commission|validated)[A-Za-z0-9_.]*\.value|commission_percent:\s*commissionValue/, "Payment Method writes must use the validated exact decimal string");
assert.doesNotMatch(taxRules, /Number\(rule\.tax_rate\)/, "Tax Rule mutation truth must not pass through Number()");
assert.match(taxRules, /tax_rate:\s*(?:parsed|rate|validated)[A-Za-z0-9_.]*\.value|tax_rate:\s*rateValue/, "Tax Rule writes must use the validated exact decimal string or null");

// Users already have strong server validation; the modal must surface the same contract before API mutation.
for (const helper of ["isValidEmail", "isValidPhone", "normalizeEmail", "sanitizePhoneInput"]) {
  assert.match(users, new RegExp(`\\b${helper}\\b`), `Users UI must use shared ${helper}`);
}
assert.match(users, /type UserFieldErrors\b/, "Users UI must model field-level validation errors");
assert.match(users, /focusFirstInvalid|focus\(\)/, "Users UI must focus the first invalid field");
assert.match(users, /id="user-email"[\s\S]*error=/, "User email input must expose its field error");
assert.match(users, /id="user-phone"[\s\S]*error=/, "User phone input must expose its field error");
assert.match(users, /id="user-(?:create-|temporary-)?password"[\s\S]*error=/, "User password inputs must expose their field errors");

// General Settings must keep DB-first validation visible at the field that failed.
assert.match(company, /type CompanyProfileFieldErrors\b/, "Company Profile must model field-level errors");
assert.match(company, /focusFirstInvalid|focus\(\)/, "Company Profile must focus the first invalid field");
for (const key of ["company-name", "email", "phone", "website", "logo-url", "country-code"]) {
  assert.match(company, new RegExp(`id=[{\"](?:company-)?${key}`), `Company Profile must expose a stable ${key} field id`);
}
assert.match(localization, /type LocalizationFieldErrors\b/, "Localization must model field-level errors");
assert.match(localization, /focusFirstInvalid|focus\(\)/, "Localization must focus the first invalid field");
assert.match(localization, /error=/, "Localization inputs must expose field-level errors through shared controls");

// Store CMS keeps current direct RLS-protected table boundaries, but invalid drafts must fail before writes.
assert.match(marketing, /type MarketingFieldErrors\b/, "Store Marketing must model field-level errors");
assert.match(marketing, /focusFirstInvalid|focus\(\)/, "Store Marketing must focus the first invalid field");
assert.match(marketing, /error=/, "Store Marketing fields must expose field-level errors");
assert.match(pages, /type PageFieldErrors\b/, "Store Page editor must model field-level errors");
assert.match(pages, /focusFirstInvalid|focus\(\)/, "Store Page editor must focus the first invalid field");
assert.match(pages, /error=/, "Store Page editor fields must expose field-level errors");
assert.match(reviewDomain, /validateStoreReview\(/, "Store Review domain validation must remain authoritative before writes");
assert.match(reviews, /type ReviewFieldErrors\b/, "Store Reviews must surface domain validation as field errors");
assert.match(reviews, /focusFirstInvalid|focus\(\)/, "Store Reviews must focus the first invalid field");

// VAL-5 is a normal smoke gate and remains in progress until post-merge production acceptance.
assert.match(packageJson, /"smoke:val-5-store-users-settings"\s*:/, "VAL-5 must be invokable from package scripts");
assert.match(packageJson, /"smoke"[\s\S]*smoke:val-5-store-users-settings/, "VAL-5 must be part of the normal Admin smoke chain");
assert.match(roadmap, /- \[~\] VAL-5 — Store CMS \/ Users \/ Settings \/ remaining Admin forms\./, "VAL-5 roadmap state must be in progress during implementation/acceptance");

console.log("VAL-5 Store CMS / Users / Settings validation contract: ok");
