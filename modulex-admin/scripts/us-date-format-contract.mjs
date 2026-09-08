import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

const DATE_FIELD = /^(?:date|.*_date|.*_on|.*_at|.*Date|.*At)$/;
const SIMPLE_MEMBER_EXPRESSION = /\{\s*([A-Za-z_$][\w$]*(?:(?:\?\.|\.)[A-Za-z_$][\w$]*)+)\s*(?:(?:\|\||\?\?)\s*(?:"[^"]*"|'[^']*'))?\s*\}/g;

function rawDateDisplays(source) {
  const findings = [];
  for (const match of source.matchAll(SIMPLE_MEMBER_EXPRESSION)) {
    const member = match[1];
    const field = member.split(/\?\.|\./).at(-1) ?? "";
    if (!DATE_FIELD.test(field)) continue;

    const index = match.index ?? 0;
    const lastOpenTag = source.lastIndexOf("<", index);
    const lastClosedTag = source.lastIndexOf(">", index);
    if (lastClosedTag <= lastOpenTag) continue;

    findings.push(member);
  }
  return findings;
}

assert.deepEqual(rawDateDisplays('<td>{row.due_date || "—"}</td>'), ["row.due_date"]);
assert.deepEqual(rawDateDisplays('<p>Reviewed · {review.review_date}</p>'), ["review.review_date"]);
assert.deepEqual(rawDateDisplays('<td>{formatDateOnly(row.due_date)}</td>'), []);
assert.deepEqual(rawDateDisplays('<DateInput value={row.due_date} onChange={() => {}} />'), []);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const presentationRoots = [path.join(root, "src", "app"), path.join(root, "src", "components")];
const rawFindings = [];

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (["api", "__tests__", "node_modules", ".next"].includes(entry.name)) continue;
      await walk(absolutePath);
      continue;
    }
    if (!entry.isFile() || !/\.(?:tsx|jsx)$/.test(entry.name)) continue;

    const source = await readFile(absolutePath, "utf8");
    for (const member of rawDateDisplays(source)) {
      const expressionIndex = source.indexOf(member);
      const line = expressionIndex === -1 ? 1 : source.slice(0, expressionIndex).split(/\r?\n/).length;
      rawFindings.push(`${path.relative(root, absolutePath)}:${line} ${member}`);
    }
  }
}

for (const presentationRoot of presentationRoots) await walk(presentationRoot);

assert.deepEqual(
  rawFindings,
  [],
  `Human-facing date fields must use shared MM.DD.YYYY formatters instead of rendering canonical values directly:\n${rawFindings.join("\n")}`,
);

console.log("PASS: Admin deterministic US date format contract");
