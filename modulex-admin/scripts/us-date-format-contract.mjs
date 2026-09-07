import assert from "node:assert/strict";

const dates = await import(new URL("../src/lib/dates/usDate.ts", import.meta.url));

assert.equal(dates.formatDateOnly("2026-01-05"), "01.05.2026");
assert.equal(dates.formatDateOnly("2026-09-07"), "09.07.2026");
assert.equal(dates.formatDateInput("2026-09-07"), "09.07.2026");
assert.equal(dates.formatDateOnly("not-a-date"), "—");
assert.equal(dates.formatDateOnly(null), "—");

assert.deepEqual(dates.parseDateInput("12.31.2026"), { ok: true, value: "2026-12-31" });
assert.deepEqual(dates.parseDateInput("02.29.2028"), { ok: true, value: "2028-02-29" });
for (const invalid of ["02.29.2027", "02.30.2026", "13.01.2026", "1.2.2026", "2026-09-07", ""]) {
  assert.deepEqual(dates.parseDateInput(invalid), { ok: false, error: "Enter a date as MM.DD.YYYY." }, invalid);
}

assert.equal(
  dates.formatTimestampDate("2026-09-08T01:30:00Z", { timeZone: "America/New_York" }),
  "09.07.2026",
);
assert.equal(dates.formatTimestampDate(null), "—");

const timestamp = dates.formatDateTime("2026-09-07T15:30:00Z", { timeStyle: "short", timeZone: "UTC" });
assert.match(timestamp, /^09\.07\.2026\s+/);
assert.match(timestamp, /15|3/);
assert.notEqual(timestamp, "09.07.2026");
assert.equal(dates.formatDateTime(null), "—");

console.log("PASS: Admin deterministic US date format contract");
