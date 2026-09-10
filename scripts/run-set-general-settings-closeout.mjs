import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const helperPath = path.resolve("scripts/apply-set-general-settings-closeout.mjs");
let source = fs.readFileSync(helperPath, "utf8");
const before = 'return \\`${currency} \\${amount.toFixed(2)}\\`;';
const after = 'return \\`\\${currency} \\${amount.toFixed(2)}\\`;';
const occurrences = source.split(before).length - 1;
if (occurrences !== 3) {
  throw new Error(`Expected 3 generated currency formatter fragments, found ${occurrences}.`);
}
source = source.split(before).join(after);
fs.writeFileSync(helperPath, source);
await import(`${pathToFileURL(helperPath).href}?run=${Date.now()}`);
