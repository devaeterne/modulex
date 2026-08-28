import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const notifications = read("src/components/header/NotificationDropdown.tsx");
const emailPump = read("src/components/email/EmailNotificationPump.tsx");

assert.match(notifications, /NOTIFICATION_POLL_INTERVAL_MS\s*=\s*60_000/);
assert.match(notifications, /document\.visibilityState\s*!==\s*["']visible["']/);
assert.match(notifications, /const \{ profile \} = await getCurrentProfile\(\);/);
assert.doesNotMatch(notifications, /async function loadNotifications\([^)]*\)[\s\S]*?await getCurrentProfile\(\)/);

assert.match(emailPump, /PROCESS_INTERVAL_MS\s*=\s*60_000/);
assert.match(emailPump, /EMAIL_PUMP_LEASE_KEY/);
assert.match(emailPump, /document\.visibilityState\s*!==\s*["']visible["']/);
assert.match(emailPump, /localStorage\.setItem\(EMAIL_PUMP_LEASE_KEY/);

console.log("admin polling contract PASS");
