import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

const source = readFileSync(resolve(process.cwd(), "src/lib/errors/unknown-error.ts"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const encoded = Buffer.from(compiled).toString("base64");
const { serializeUnknownError, unknownErrorMessage } = await import(
  `data:text/javascript;base64,${encoded}#${Date.now()}`
);

const postgrestError = {
  message: 'null value in column "category_id" violates not-null constraint',
  code: "23502",
  details: "Failing row contains a null category_id.",
  hint: "Map the vendor category before Product Master creation.",
};

assert.equal(unknownErrorMessage(postgrestError, "fallback"), postgrestError.message);
assert.deepEqual(serializeUnknownError(postgrestError), postgrestError);
assert.equal(unknownErrorMessage({}, "fallback"), "fallback");

console.log("vendor structured error behavior contract: ok");
