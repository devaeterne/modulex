import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const adminRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(adminRoot, "src");
const write = process.argv.includes("--write");
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx"]);
const excluded = new Set([
  path.join(sourceRoot, "lib", "dates", "usDate.ts"),
  path.join(sourceRoot, "components", "form", "DateInput.tsx"),
  path.join(sourceRoot, "components", "form", "date-picker.tsx"),
]);

function normalizePath(value) {
  return value.split(path.sep).join("/");
}

function isPresentationPath(filePath) {
  const relative = normalizePath(path.relative(adminRoot, filePath));
  if (relative.startsWith("src/components/")) return true;
  if (relative.startsWith("src/app/") && !relative.includes("/api/")) return true;
  return false;
}

async function walk(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(target));
    } else if (sourceExtensions.has(path.extname(entry.name))) {
      files.push(target);
    }
  }
  return files;
}

function isIntlDateTimeFormat(node) {
  return ts.isNewExpression(node)
    && ts.isPropertyAccessExpression(node.expression)
    && ts.isIdentifier(node.expression.expression)
    && node.expression.expression.text === "Intl"
    && node.expression.name.text === "DateTimeFormat";
}

function objectProperty(options, name) {
  if (!options || !ts.isObjectLiteralExpression(options)) return null;
  for (const property of options.properties) {
    if (ts.isPropertyAssignment(property) && property.name.getText() === name) return property.initializer;
    if (ts.isShorthandPropertyAssignment(property) && property.name.text === name) return property.name;
  }
  return null;
}

function formatterKind(node) {
  const options = node.arguments?.[1];
  if (!options) return "date";
  if (!ts.isObjectLiteralExpression(options)) return "unsupported";
  const timeKeys = new Set(["timeStyle", "hour", "minute", "second", "fractionalSecondDigits", "dayPeriod"]);
  return options.properties.some((property) => {
    const name = property.name?.getText().replace(/["']/g, "");
    return name ? timeKeys.has(name) : false;
  }) ? "datetime" : "date";
}

function timeZoneOption(node, sourceFile) {
  const options = node.arguments?.[1];
  if (!options) return "";
  if (!ts.isObjectLiteralExpression(options)) return null;
  const timeZone = objectProperty(options, "timeZone");
  return timeZone ? `, { timeZone: ${timeZone.getText(sourceFile)} }` : "";
}

function unwrapDateArgument(node, sourceFile) {
  if (ts.isNewExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === "Date"
      && node.arguments?.length === 1) {
    const argument = node.arguments[0];
    const text = argument.getText(sourceFile);
    if (/T00:00:00/.test(text) && /\.slice\(0,\s*10\)/.test(text)) return { unsupported: true, text };
    return { text };
  }
  return { text: node.getText(sourceFile) };
}

function localeTimeZoneOption(call, sourceFile) {
  const options = call.arguments?.[1];
  if (!options) return "";
  if (!ts.isObjectLiteralExpression(options)) return null;
  const timeZone = objectProperty(options, "timeZone");
  return timeZone ? `, { timeZone: ${timeZone.getText(sourceFile)} }` : "";
}

function looksLikeDateReceiver(node, sourceFile) {
  if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "Date") return true;
  const text = node.getText(sourceFile);
  return /(?:date|time|timestamp|created|updated|issued|expire|due|start|end|paid|posted|received|scheduled|submitted|completed|observed|generated|last|_at|At)$/i.test(text.replace(/[^A-Za-z0-9_$]/g, ""));
}

function addReplacement(replacements, start, end, text, label, errors, filePath) {
  const overlap = replacements.find((item) => start < item.end && end > item.start);
  if (overlap) {
    errors.push(`${normalizePath(path.relative(adminRoot, filePath))}: overlapping ${label} with ${overlap.label}`);
    return false;
  }
  replacements.push({ start, end, text, label });
  return true;
}

function mergeImports(source, sourceFile, replacements, helpers, needsDateInput, errors, filePath) {
  const additions = [];
  if (helpers.size) {
    additions.push(`import { ${[...helpers].sort().join(", ")} } from "@/lib/dates/usDate";`);
  }
  if (needsDateInput) additions.push('import DateInput from "@/components/form/DateInput";');
  if (!additions.length) return;

  if (source.includes('from "@/lib/dates/usDate"') || source.includes("from '@/lib/dates/usDate'")) {
    errors.push(`${normalizePath(path.relative(adminRoot, filePath))}: existing usDate import requires manual merge`);
    return;
  }
  if (needsDateInput && (source.includes('from "@/components/form/DateInput"') || source.includes("from '@/components/form/DateInput'"))) {
    errors.push(`${normalizePath(path.relative(adminRoot, filePath))}: existing DateInput import requires manual merge`);
    return;
  }

  const imports = sourceFile.statements.filter(ts.isImportDeclaration);
  const insertAt = imports.length ? imports[imports.length - 1].getEnd() : 0;
  const prefix = insertAt ? "\n" : "";
  addReplacement(replacements, insertAt, insertAt, `${prefix}${additions.join("\n")}`, "imports", errors, filePath);
}

function migrateDateInput(node, source, sourceFile, replacements, errors, filePath) {
  const tag = node.tagName.getText(sourceFile);
  if (tag !== "Input" && tag !== "input") return false;
  const typeAttribute = node.attributes.properties.find((property) =>
    ts.isJsxAttribute(property)
      && property.name.getText(sourceFile) === "type"
      && property.initializer
      && ts.isStringLiteral(property.initializer)
      && property.initializer.text === "date");
  if (!typeAttribute) return false;

  const attributes = node.attributes.properties.filter(ts.isJsxAttribute);
  const unsupported = attributes
    .map((property) => property.name.getText(sourceFile))
    .filter((name) => ["defaultValue", "min", "max", "step", "pattern"].includes(name));
  if (unsupported.length) {
    errors.push(`${normalizePath(path.relative(adminRoot, filePath))}:${sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1} unsupported date-input props: ${unsupported.join(", ")}`);
    return true;
  }

  const valueAttribute = attributes.find((property) => property.name.getText(sourceFile) === "value");
  const onChangeAttribute = attributes.find((property) => property.name.getText(sourceFile) === "onChange");
  if (!valueAttribute || !onChangeAttribute || !onChangeAttribute.initializer || !ts.isJsxExpression(onChangeAttribute.initializer)) {
    errors.push(`${normalizePath(path.relative(adminRoot, filePath))}:${sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1} date input must be controlled with an inline onChange handler`);
    return true;
  }

  const handler = onChangeAttribute.initializer.expression;
  if (!handler || !ts.isArrowFunction(handler) || handler.parameters.length !== 1 || !ts.isIdentifier(handler.parameters[0].name)) {
    errors.push(`${normalizePath(path.relative(adminRoot, filePath))}:${sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1} unsupported date-input onChange handler`);
    return true;
  }

  const parameter = handler.parameters[0].name.text;
  const originalHandler = handler.getText(sourceFile);
  let migratedHandler = originalHandler
    .replace(new RegExp(`\\b${parameter}\\.target\\.value\\b`, "g"), parameter)
    .replace(new RegExp(`\\b${parameter}\\.currentTarget\\.value\\b`, "g"), parameter);
  if (new RegExp(`\\b${parameter}\\.(?:target|currentTarget)\\b`).test(migratedHandler)) {
    errors.push(`${normalizePath(path.relative(adminRoot, filePath))}:${sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1} date-input handler uses event fields beyond value`);
    return true;
  }

  let element = source.slice(node.getStart(sourceFile), node.getEnd());
  element = element.replace(/^<(?:Input|input)\b/, "<DateInput");
  element = element.replace(/\s+type\s*=\s*["']date["']/, "");
  element = element.replace(originalHandler, migratedHandler);
  addReplacement(replacements, node.getStart(sourceFile), node.getEnd(), element, "date-input", errors, filePath);
  return true;
}

function transformSource(source, filePath) {
  const scriptKind = filePath.endsWith(".tsx") || filePath.endsWith(".jsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, scriptKind);
  const replacements = [];
  const errors = [];
  const helpers = new Set();
  let needsDateInput = false;

  function visit(node) {
    if (ts.isJsxSelfClosingElement(node)) {
      const before = replacements.length;
      const recognized = migrateDateInput(node, source, sourceFile, replacements, errors, filePath);
      if (recognized) {
        if (replacements.length > before) needsDateInput = true;
        return;
      }
    }

    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text;
      const receiver = node.expression.expression;

      if (method === "format" && isIntlDateTimeFormat(receiver) && node.arguments.length >= 1) {
        const kind = formatterKind(receiver);
        const zone = timeZoneOption(receiver, sourceFile);
        const argument = unwrapDateArgument(node.arguments[0], sourceFile);
        if (kind === "unsupported" || zone === null || argument.unsupported) {
          errors.push(`${normalizePath(path.relative(adminRoot, filePath))}:${sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1} unsupported Intl.DateTimeFormat call`);
          return;
        }
        const helper = kind === "datetime" ? "formatDateTime" : "formatTimestampDate";
        helpers.add(helper);
        addReplacement(replacements, node.getStart(sourceFile), node.getEnd(), `${helper}(${argument.text}${zone})`, "inline Intl formatter", errors, filePath);
        return;
      }

      if (method === "toLocaleDateString") {
        const zone = localeTimeZoneOption(node, sourceFile);
        if (zone === null) {
          errors.push(`${normalizePath(path.relative(adminRoot, filePath))}:${sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1} unsupported toLocaleDateString options`);
          return;
        }
        const argument = unwrapDateArgument(receiver, sourceFile);
        if (argument.unsupported) {
          errors.push(`${normalizePath(path.relative(adminRoot, filePath))}:${sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1} date-only local-midnight construction requires manual migration`);
          return;
        }
        helpers.add("formatTimestampDate");
        addReplacement(replacements, node.getStart(sourceFile), node.getEnd(), `formatTimestampDate(${argument.text}${zone})`, "toLocaleDateString", errors, filePath);
        return;
      }

      if (method === "toLocaleString" && looksLikeDateReceiver(receiver, sourceFile)) {
        const zone = localeTimeZoneOption(node, sourceFile);
        if (zone === null) {
          errors.push(`${normalizePath(path.relative(adminRoot, filePath))}:${sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1} unsupported toLocaleString options`);
          return;
        }
        const argument = unwrapDateArgument(receiver, sourceFile);
        if (argument.unsupported) {
          errors.push(`${normalizePath(path.relative(adminRoot, filePath))}:${sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1} date-only local-midnight construction requires manual migration`);
          return;
        }
        helpers.add("formatDateTime");
        addReplacement(replacements, node.getStart(sourceFile), node.getEnd(), `formatDateTime(${argument.text}${zone})`, "toLocaleString", errors, filePath);
        return;
      }
    }

    if (isIntlDateTimeFormat(node)) {
      if (ts.isPropertyAccessExpression(node.parent) && node.parent.name.text === "format") return;
      if (!ts.isVariableDeclaration(node.parent)) {
        errors.push(`${normalizePath(path.relative(adminRoot, filePath))}:${sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1} standalone Intl.DateTimeFormat requires manual migration`);
        return;
      }
      const kind = formatterKind(node);
      const zone = timeZoneOption(node, sourceFile);
      if (kind === "unsupported" || zone === null) {
        errors.push(`${normalizePath(path.relative(adminRoot, filePath))}:${sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1} unsupported Intl.DateTimeFormat declaration`);
        return;
      }
      const helper = kind === "datetime" ? "formatDateTime" : "formatTimestampDate";
      helpers.add(helper);
      addReplacement(
        replacements,
        node.getStart(sourceFile),
        node.getEnd(),
        `{ format: (value: string | Date) => ${helper}(value${zone}) }`,
        "Intl formatter declaration",
        errors,
        filePath,
      );
      return;
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  mergeImports(source, sourceFile, replacements, helpers, needsDateInput, errors, filePath);
  if (errors.length) return { errors, changed: false, output: source, replacements: 0 };
  if (!replacements.length) return { errors: [], changed: false, output: source, replacements: 0 };

  let output = source;
  for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
    output = output.slice(0, replacement.start) + replacement.text + output.slice(replacement.end);
  }
  return { errors: [], changed: output !== source, output, replacements: replacements.length };
}

const files = (await walk(sourceRoot)).filter((filePath) => isPresentationPath(filePath) && !excluded.has(filePath));
const planned = [];
const failures = [];
let replacementCount = 0;

for (const filePath of files) {
  const source = await fs.readFile(filePath, "utf8");
  const result = transformSource(source, filePath);
  if (result.errors.length) {
    failures.push(...result.errors);
    continue;
  }
  if (!result.changed) continue;
  planned.push(normalizePath(path.relative(adminRoot, filePath)));
  replacementCount += result.replacements;
  if (write) await fs.writeFile(filePath, result.output, "utf8");
}

if (failures.length) {
  console.error("US date migration stopped fail-closed. Unsupported patterns:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`${write ? "Migrated" : "Would migrate"} ${planned.length} Admin files with ${replacementCount} source edits.`);
for (const filePath of planned) console.log(`- ${filePath}`);
