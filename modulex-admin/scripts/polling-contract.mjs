import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const notifications = read("src/components/header/NotificationDropdown.tsx");
const emailPump = read("src/components/email/EmailNotificationPump.tsx");

assert.match(notifications, /NOTIFICATION_POLL_INTERVAL_MS\s*=\s*60_000/);
assert.match(notifications, /document\.visibilityState\s*!==\s*["']visible["']/);
assert.match(notifications, /async function bootstrap\(\)[\s\S]*?const \{ profile \} = await getCurrentProfile\(\);/);
assert.equal((notifications.match(/getCurrentProfile\(\)/g) ?? []).length, 1);
assert.match(notifications, /let inFlight = false/);

assert.match(emailPump, /PROCESS_INTERVAL_MS\s*=\s*60_000/);
assert.match(emailPump, /EMAIL_PUMP_LEASE_KEY/);
assert.match(emailPump, /document\.visibilityState\s*!==\s*["']visible["']/);
assert.match(emailPump, /localStorage\.setItem\(\s*EMAIL_PUMP_LEASE_KEY/);
assert.match(emailPump, /acquireLease\(ownerId\)/);

console.log("admin polling contract PASS");
