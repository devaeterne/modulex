import assert from "node:assert/strict";

const cases = [
  ['<Input type="date" />', 'native-date-input'],
  ['<input type="date" />', 'native-date-input'],
  ['value.toLocaleDateString()', 'locale-date-display'],
  ['new Intl.DateTimeFormat(undefined, { dateStyle: "medium" })', 'intl-date-display'],
  ['new Date(value).toLocaleString()', 'manual-date-construction'],
  ['placeholder="dd.mm.yyyy"', 'date-placeholder'],
  ['placeholder="yyyy-mm-dd"', 'date-placeholder'],
];

function classifyLine(_line) {
  return [];
}

function runSelfTest() {
  for (const [source, expected] of cases) {
    assert.ok(classifyLine(source).includes(expected), `${expected} was not detected for ${source}`);
  }
  console.log("PASS: US date audit scanner self-test");
}

const args = new Set(process.argv.slice(2));
if (args.has("--self-test")) {
  runSelfTest();
} else {
  throw new Error("US date audit scanner implementation is pending.");
}
