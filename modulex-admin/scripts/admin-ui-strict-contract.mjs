import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const BANNED_NATIVE_TAGS = new Map([
  ["button", "@/components/ui/button/Button"],
  ["input", "@/components/form/input/InputField"],
  ["select", "@/components/form/Select"],
  ["textarea", "@/components/form/input/TextArea"],
  ["label", "@/components/form/Label"],
  ["table", "@/components/ui/table"],
  ["thead", "@/components/ui/table"],
  ["tbody", "@/components/ui/table"],
  ["tr", "@/components/ui/table"],
  ["th", "@/components/ui/table"],
  ["td", "@/components/ui/table"],
]);

const SHARED_OWNER_PREFIXES = [
  "src/components/ui/",
  "src/components/form/",
  "src/components/common/",
];
const PAGE_HEADER_TOKENS = ["PageBreadcrumb", "PageBreadCrumb", "AdminPageHeader"];
const BYPASS_MARKERS = ["admin-ui-strict-disable", "admin-ui-ignore"];
const CANONICAL_PRIMITIVE_NAMES = new Set([
  "Alert", "Badge", "Button", "ComponentCard", "Input", "Label", "Modal", "Select",
  "Table", "TableBody", "TableCell", "TableHeader", "TableRow", "TableStateRow",
  "TableViewport", "TextArea",
]);

function normalizePath(value) {
  let result = String(value ?? "").trim().replaceAll("\\", "/");
  result = result.replace(/^\.\//, "");
  const marker = "modulex-admin/";
  const index = result.indexOf(marker);
  if (index >= 0) result = result.slice(index + marker.length);
  return result;
}

export function isAuditedFeaturePath(relativePath) {
  const file = normalizePath(relativePath);
  if (!file.endsWith(".tsx")) return false;
  if (SHARED_OWNER_PREFIXES.some((prefix) => file.startsWith(prefix))) return false;
  if (/^src\/app\/\(admin\)\/.+\/page\.tsx$/.test(file)) return true;
  return file.startsWith("src/components/");
}

function position(sourceFile, node) {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return { line: line + 1, column: character + 1 };
}
function addViolation(violations, sourceFile, relativePath, node, rule, message) {
  const loc = position(sourceFile, node);
  violations.push({ file: relativePath, rule, line: loc.line, column: loc.column, message });
}
function collectStaticClassSegments(initializer) {
  if (!initializer) return [];
  if (ts.isStringLiteral(initializer)) return [initializer.text];
  if (!ts.isJsxExpression(initializer) || !initializer.expression) return [];
  const expression = initializer.expression;
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) return [expression.text];
  if (ts.isTemplateExpression(expression)) return [expression.head.text, ...expression.templateSpans.map((span) => span.literal.text)];
  return [];
}

const ALLOWED_TEXT_UTILITIES = new Set([
  "text-left", "text-center", "text-right", "text-justify", "text-start", "text-end",
  "text-wrap", "text-nowrap", "text-balance", "text-pretty", "text-ellipsis", "text-clip",
  "text-xs", "text-sm", "text-base", "text-lg", "text-xl", "text-2xl", "text-3xl",
  "text-4xl", "text-5xl", "text-6xl", "text-7xl", "text-8xl", "text-9xl",
  "text-theme-xs", "text-theme-sm", "text-theme-xl", "text-title-sm", "text-title-md", "text-title-lg",
]);
function utilityPart(token) {
  const parts = token.split(":");
  return { variants: parts.slice(0, -1), utility: parts.at(-1) ?? token };
}
function isColorBearingBorder(utility) {
  if (!utility.startsWith("border-")) return false;
  const suffix = utility.slice("border-".length);
  if (/^(?:[trblxyse]|[trblxyse]-\d+|\d+|0|2|4|8)$/.test(suffix)) return false;
  if (/^(?:solid|dashed|dotted|double|hidden|none)$/.test(suffix)) return false;
  return true;
}
function blockedAppearanceReason(token) {
  const { variants, utility } = utilityPart(token);
  if (variants.includes("dark")) return "dark-mode appearance must be owned by a shared primitive/token";
  if (utility === "bg" || utility.startsWith("bg-")) return "background appearance must be owned by a shared primitive/token";
  if (utility === "rounded" || utility.startsWith("rounded-")) return "radius appearance must be owned by a shared primitive/token";
  if (utility === "shadow" || utility.startsWith("shadow-")) return "shadow appearance must be owned by a shared primitive/token";
  if (utility === "ring" || utility.startsWith("ring-")) return "ring appearance must be owned by a shared primitive/token";
  if (isColorBearingBorder(utility)) return "border color must be owned by a shared primitive/token";
  if (utility.startsWith("text-") && !ALLOWED_TEXT_UTILITIES.has(utility)) return "text color must be owned by a shared primitive/token";
  return null;
}
function getJsxTagName(node) {
  const tagName = ts.isJsxElement(node) ? node.openingElement.tagName : node.tagName;
  return ts.isIdentifier(tagName) ? tagName.text : tagName.getText();
}
function inspectNodeForPrimitiveRecreation(node) {
  let recreates = false;
  const visit = (child) => {
    if (recreates) return;
    if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)) {
      const tag = getJsxTagName(child);
      if (BANNED_NATIVE_TAGS.has(tag)) { recreates = true; return; }
      const attributes = ts.isJsxElement(child) ? child.openingElement.attributes.properties : child.attributes.properties;
      for (const attribute of attributes) {
        if (!ts.isJsxAttribute(attribute) || attribute.name.text !== "className") continue;
        const segments = collectStaticClassSegments(attribute.initializer);
        if (segments.some((segment) => segment.split(/\s+/).filter(Boolean).some(blockedAppearanceReason))) { recreates = true; return; }
      }
    }
    ts.forEachChild(child, visit);
  };
  ts.forEachChild(node, visit);
  return recreates;
}
function declarationName(node) {
  if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) && node.name) return node.name.text;
  if (ts.isVariableStatement(node)) {
    for (const declaration of node.declarationList.declarations) if (ts.isIdentifier(declaration.name)) return declaration.name.text;
  }
  return null;
}

export function auditSource(relativePath, source) {
  const file = normalizePath(relativePath);
  if (!isAuditedFeaturePath(file)) return [];
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const violations = [];
  for (const marker of BYPASS_MARKERS) {
    const index = source.indexOf(marker);
    if (index >= 0) addViolation(violations, sourceFile, file, { getStart: () => index }, "bypass", `${marker} is not allowed; change the shared contract or primitive instead`);
  }
  if (/^src\/app\/\(admin\)\/.+\/page\.tsx$/.test(file) && !PAGE_HEADER_TOKENS.some((token) => source.includes(token))) {
    addViolation(violations, sourceFile, file, sourceFile, "page-heading", "Admin route pages must use the shared PageBreadcrumb/PageBreadCrumb heading convention");
  }
  const visit = (node) => {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = getJsxTagName(node);
      const replacement = BANNED_NATIVE_TAGS.get(tag);
      if (replacement) addViolation(violations, sourceFile, file, node, "native-primitive", `native <${tag}> is not allowed in feature UI; use ${replacement}`);
      const attributes = ts.isJsxElement(node) ? node.openingElement.attributes.properties : node.attributes.properties;
      for (const attribute of attributes) {
        if (!ts.isJsxAttribute(attribute) || attribute.name.text !== "className") continue;
        for (const segment of collectStaticClassSegments(attribute.initializer)) for (const token of segment.split(/\s+/).filter(Boolean)) {
          const reason = blockedAppearanceReason(token);
          if (reason) addViolation(violations, sourceFile, file, attribute, "route-appearance", `class "${token}" is not allowed in feature UI; ${reason}`);
        }
      }
    }
    const name = declarationName(node);
    if (name && CANONICAL_PRIMITIVE_NAMES.has(name) && inspectNodeForPrimitiveRecreation(node)) {
      addViolation(violations, sourceFile, file, node, "recreated-primitive", `${name} recreates a canonical visual primitive in feature code; import the shared Modulex primitive instead`);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  const unique = new Map();
  for (const violation of violations) {
    const key = `${violation.rule}:${violation.line}:${violation.column}:${violation.message}`;
    if (!unique.has(key)) unique.set(key, violation);
  }
  return [...unique.values()];
}

function runGit(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}
function parseExplicitFiles(value) {
  return String(value ?? "").split(/[\n,]+/).map(normalizePath).filter(Boolean);
}
function isUsableSha(value) {
  return /^[0-9a-f]{40}$/i.test(value ?? "") && !/^0{40}$/.test(value ?? "");
}
export function resolveChangedFiles(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const explicitFiles = options.explicitFiles ?? env.ADMIN_UI_STRICT_FILES;
  if (explicitFiles) return [...new Set(parseExplicitFiles(explicitFiles))];
  const explicitBase = options.baseRef ?? env.ADMIN_UI_STRICT_BASE_REF;
  if (explicitBase) {
    const mergeBase = runGit(["merge-base", "HEAD", explicitBase], cwd);
    return parseExplicitFiles(runGit(["diff", "--name-only", "--diff-filter=ACMR", `${mergeBase}...HEAD`], cwd));
  }
  if (env.GITHUB_BASE_REF) {
    const remoteBase = `origin/${env.GITHUB_BASE_REF}`;
    const mergeBase = runGit(["merge-base", "HEAD", remoteBase], cwd);
    return parseExplicitFiles(runGit(["diff", "--name-only", "--diff-filter=ACMR", `${mergeBase}...HEAD`], cwd));
  }
  if (isUsableSha(env.GITHUB_EVENT_BEFORE) && isUsableSha(env.GITHUB_SHA)) {
    return parseExplicitFiles(runGit(["diff", "--name-only", "--diff-filter=ACMR", `${env.GITHUB_EVENT_BEFORE}...${env.GITHUB_SHA}`], cwd));
  }
  return parseExplicitFiles(runGit(["diff", "--name-only", "--diff-filter=ACMR", "HEAD^...HEAD"], cwd));
}

export function runCli({ cwd = process.cwd(), env = process.env } = {}) {
  let changedFiles;
  try { changedFiles = resolveChangedFiles({ cwd, env }); }
  catch (error) {
    console.error(`Admin UI strict changed-file discovery failed: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
  const auditedFiles = changedFiles.map(normalizePath).filter(isAuditedFeaturePath).filter((file) => fs.existsSync(path.join(cwd, file)));
  const violations = auditedFiles.flatMap((file) => auditSource(file, fs.readFileSync(path.join(cwd, file), "utf8")));
  if (violations.length > 0) {
    for (const violation of violations) console.error(`${violation.file}:${violation.line}:${violation.column} [${violation.rule}] ${violation.message}`);
    return 1;
  }
  console.log(`PASS: admin UI strict changed-file contract (${auditedFiles.length} audited files)`);
  return 0;
}
const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) process.exitCode = runCli();
