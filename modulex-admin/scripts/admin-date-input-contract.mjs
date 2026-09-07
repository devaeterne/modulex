import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  try {
    return await readFile(path.join(root, relativePath), "utf8");
  } catch {
    assert.fail(`Required Admin date input file is missing: ${relativePath}`);
  }
}

const [dateInput, datePicker] = await Promise.all([
  source("src/components/form/DateInput.tsx"),
  source("src/components/form/date-picker.tsx"),
]);

assert.match(dateInput, /from ["']\.\/input\/InputField["']/);
assert.match(dateInput, /formatDateInput/);
assert.match(dateInput, /parseDateInput/);
assert.match(dateInput, /MM\.DD\.YYYY/);
assert.match(dateInput, /inputMode=["']numeric["']/);
assert.match(dateInput, /maxLength=\{10\}/);
assert.doesNotMatch(dateInput, /type=["']date["']/);
assert.match(dateInput, /onChange\([^)]*(?:parsed\.value|result\.value)/);
assert.match(dateInput, /onChange\(["']{2}\)/);

assert.doesNotMatch(datePicker, /dateFormat:\s*["']Y-m-d["']/);
assert.match(datePicker, /dateFormat:\s*["']m\.d\.Y["']/);

console.log("PASS: shared Admin DateInput contract");
