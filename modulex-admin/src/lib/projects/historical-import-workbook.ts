import crypto from "node:crypto";
import { inflateRawSync } from "node:zlib";

export const HISTORICAL_PROJECT_STATUSES = [
  "draft",
  "quoted",
  "approved",
  "ordered",
  "in_progress",
  "completed",
  "cancelled",
] as const;

export type HistoricalProjectStatus = (typeof HISTORICAL_PROJECT_STATUSES)[number];

export const REQUIRED_HEADERS = [
  "Customer",
  "Project Name",
  "Project Address",
  "Start Date",
  "End Date",
  "Sales Rep",
  "Initial Contract Price",
  "Price After Change Orders",
  "Profit Margin",
] as const;

type ImportKey =
  | "customer"
  | "project_name"
  | "project_address"
  | "start_date"
  | "end_date"
  | "sales_rep"
  | "initial_contract_price"
  | "price_after_change_orders"
  | "profit_margin";

type CellValue = string | number | boolean | null;

type Cell = {
  value: CellValue;
  dateStyle: boolean;
  percentStyle: boolean;
};

type Row = {
  rowNumber: number;
  cells: Map<number, Cell>;
};

export type HistoricalProjectImportRow = {
  row_number: number;
  customer: string | null;
  project_name: string | null;
  project_address: string | null;
  start_date: string | null;
  end_date: string | null;
  sales_rep: string | null;
  initial_contract_price: number | null;
  price_after_change_orders: number | null;
  profit_margin: number | null;
  profit_margin_unit: "number" | "percent" | null;
  target_status: HistoricalProjectStatus;
  raw_payload: Record<string, CellValue>;
  row_sha256: string;
};

export type HistoricalWorkbookExtraction = {
  sheet: string;
  sheets: string[];
  headers: string[];
  rows: HistoricalProjectImportRow[];
};

const HEADER_ALIASES: Record<ImportKey, readonly string[]> = {
  customer: ["customer"],
  project_name: ["project name", "project"],
  project_address: ["project address", "address"],
  start_date: ["start date"],
  end_date: ["end date"],
  sales_rep: ["sales rep", "sales representative"],
  initial_contract_price: ["initial contract price", "contract price"],
  price_after_change_orders: ["price after change orders", "price after change order"],
  profit_margin: ["profit margin", "margin"],
};

const ALIAS_TO_KEY = new Map<string, ImportKey>();
for (const [key, aliases] of Object.entries(HEADER_ALIASES) as Array<[ImportKey, readonly string[]]>) {
  for (const alias of aliases) ALIAS_TO_KEY.set(alias, key);
}

const BUILTIN_DATE_STYLE_IDS = new Set([
  14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 30, 36, 45, 46, 47, 50, 57,
]);
const BUILTIN_PERCENT_STYLE_IDS = new Set([9, 10]);

function sha256(value: Buffer | string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function decodeXml(value: string) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#([0-9]+);/g, (_match, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function attribute(source: string, name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(new RegExp(`(?:^|\\s)${escaped}=(?:"([^"]*)"|'([^']*)')`));
  return match ? decodeXml(match[1] ?? match[2] ?? "") : null;
}

function findEndOfCentralDirectory(buffer: Buffer) {
  const signature = 0x06054b50;
  const minimum = Math.max(0, buffer.length - 0xffff - 22);
  for (let offset = buffer.length - 22; offset >= minimum; offset -= 1) {
    if (buffer.readUInt32LE(offset) === signature) return offset;
  }
  throw new Error("PROJECT_IMPORT_XLSX_ZIP_INVALID");
}

function unzip(buffer: Buffer) {
  const entries = new Map<string, Buffer>();
  const eocd = findEndOfCentralDirectory(buffer);
  const totalEntries = buffer.readUInt16LE(eocd + 10);
  let cursor = buffer.readUInt32LE(eocd + 16);

  for (let index = 0; index < totalEntries; index += 1) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) {
      throw new Error("PROJECT_IMPORT_XLSX_CENTRAL_DIRECTORY_INVALID");
    }

    const compression = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const fileNameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.subarray(cursor + 46, cursor + 46 + fileNameLength).toString("utf8");

    if (buffer.readUInt32LE(localOffset) !== 0x04034b50) {
      throw new Error("PROJECT_IMPORT_XLSX_LOCAL_HEADER_INVALID");
    }
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);

    if (compression === 0) entries.set(name, Buffer.from(compressed));
    else if (compression === 8) entries.set(name, inflateRawSync(compressed));
    else throw new Error(`PROJECT_IMPORT_XLSX_COMPRESSION_UNSUPPORTED:${compression}`);

    cursor += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

function requireEntry(entries: Map<string, Buffer>, name: string) {
  const value = entries.get(name);
  if (!value) throw new Error(`PROJECT_IMPORT_XLSX_ENTRY_MISSING:${name}`);
  return value.toString("utf8");
}

function normalizeHeader(value: CellValue) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

function columnIndex(reference: string) {
  const letters = reference.replace(/[^a-z]/gi, "").toUpperCase();
  let result = 0;
  for (const char of letters) result = result * 26 + char.charCodeAt(0) - 64;
  return result - 1;
}

function isDateFormat(code: string) {
  const cleaned = code
    .replace(/"[^"]*"/g, "")
    .replace(/\[[^\]]*\]/g, "")
    .toLowerCase();
  return /(^|[^\\])[dmy]/.test(cleaned);
}

function loadStyles(entries: Map<string, Buffer>) {
  const xml = entries.get("xl/styles.xml")?.toString("utf8") ?? "";
  const customFormats = new Map<number, string>();
  for (const match of xml.matchAll(/<numFmt\b([^>]*)\/?\s*>/g)) {
    const id = Number(attribute(match[1], "numFmtId"));
    const code = attribute(match[1], "formatCode") ?? "";
    if (Number.isFinite(id)) customFormats.set(id, code);
  }

  const styleIds: number[] = [];
  const cellXfs = xml.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/)?.[1] ?? "";
  for (const match of cellXfs.matchAll(/<xf\b([^>]*)\/?\s*>/g)) {
    styleIds.push(Number(attribute(match[1], "numFmtId") ?? 0));
  }

  return (styleIndex: number | null) => {
    if (styleIndex === null || styleIndex < 0 || styleIndex >= styleIds.length) {
      return { dateStyle: false, percentStyle: false };
    }
    const formatId = styleIds[styleIndex];
    const code = customFormats.get(formatId) ?? "";
    return {
      dateStyle: BUILTIN_DATE_STYLE_IDS.has(formatId) || isDateFormat(code),
      percentStyle: BUILTIN_PERCENT_STYLE_IDS.has(formatId) || code.includes("%"),
    };
  };
}

function loadSharedStrings(entries: Map<string, Buffer>) {
  const xml = entries.get("xl/sharedStrings.xml")?.toString("utf8") ?? "";
  const values: string[] = [];
  for (const match of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
    const parts = Array.from(match[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g), (item) => decodeXml(item[1]));
    values.push(parts.join(""));
  }
  return values;
}

function loadSheets(entries: Map<string, Buffer>) {
  const workbook = requireEntry(entries, "xl/workbook.xml");
  const relations = requireEntry(entries, "xl/_rels/workbook.xml.rels");
  const relationMap = new Map<string, string>();

  for (const match of relations.matchAll(/<Relationship\b([^>]*)\/?\s*>/g)) {
    const id = attribute(match[1], "Id");
    const target = attribute(match[1], "Target");
    if (!id || !target) continue;
    const full = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
    relationMap.set(id, full.replace(/\/\.\//g, "/"));
  }

  const sheets: Array<{ name: string; path: string }> = [];
  for (const match of workbook.matchAll(/<sheet\b([^>]*)\/?\s*>/g)) {
    const name = attribute(match[1], "name");
    const relationshipId = attribute(match[1], "r:id");
    const target = relationshipId ? relationMap.get(relationshipId) : null;
    if (name && target) sheets.push({ name, path: target });
  }
  if (sheets.length === 0) throw new Error("PROJECT_IMPORT_XLSX_NO_WORKSHEETS");
  return sheets;
}

function parseCellValue(
  attributes: string,
  body: string,
  sharedStrings: string[],
  styleFlags: ReturnType<typeof loadStyles>,
): Cell {
  const type = attribute(attributes, "t");
  const styleText = attribute(attributes, "s");
  const flags = styleFlags(styleText === null ? null : Number(styleText));

  if (type === "inlineStr") {
    const text = Array.from(body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g), (match) => decodeXml(match[1])).join("");
    return { value: text, ...flags };
  }

  const raw = body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1];
  if (raw === undefined) return { value: null, ...flags };
  const decoded = decodeXml(raw);
  if (type === "s") return { value: sharedStrings[Number(decoded)] ?? "", ...flags };
  if (type === "str" || type === "e") return { value: decoded, ...flags };
  if (type === "b") return { value: decoded === "1", ...flags };
  const numeric = Number(decoded);
  return { value: Number.isFinite(numeric) ? numeric : decoded, ...flags };
}

function parseRows(entries: Map<string, Buffer>, sheetPath: string) {
  const xml = requireEntry(entries, sheetPath);
  const sharedStrings = loadSharedStrings(entries);
  const styleFlags = loadStyles(entries);
  const rows: Row[] = [];

  for (const rowMatch of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const rowNumber = Number(attribute(rowMatch[1], "r") ?? rows.length + 1);
    const cells = new Map<number, Cell>();
    for (const cellMatch of rowMatch[2].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const reference = attribute(cellMatch[1], "r") ?? "";
      cells.set(columnIndex(reference), parseCellValue(cellMatch[1], cellMatch[2], sharedStrings, styleFlags));
    }
    rows.push({ rowNumber, cells });
  }
  return rows;
}

function excelDate(value: number) {
  const timestamp = Date.UTC(1899, 11, 30) + value * 86_400_000;
  return new Date(timestamp).toISOString().slice(0, 10);
}

function parseDate(value: CellValue, dateStyle: boolean) {
  if (value === null || value === "") return null;
  if (typeof value === "number") return excelDate(value);
  const text = String(value).trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const us = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/);
  if (us) {
    const year = us[3].length === 2 ? 2000 + Number(us[3]) : Number(us[3]);
    const month = Number(us[1]);
    const day = Number(us[2]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day) {
      return date.toISOString().slice(0, 10);
    }
  }
  const numeric = Number(text);
  if (Number.isFinite(numeric) && (dateStyle || numeric > 20_000)) return excelDate(numeric);
  throw new Error(`PROJECT_IMPORT_UNSUPPORTED_DATE:${text}`);
}

function parseNumber(value: CellValue) {
  if (value === null || value === "") return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("PROJECT_IMPORT_NON_FINITE_NUMBER");
    return value;
  }
  const original = String(value).trim();
  if (!original) return null;
  const negative = /^\(.*\)$/.test(original);
  const cleaned = original.replace(/[()$,]/g, "").trim();
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) throw new Error(`PROJECT_IMPORT_INVALID_NUMBER:${original}`);
  return negative ? -parsed : parsed;
}

function parseMargin(value: CellValue, percentStyle: boolean) {
  if (value === null || value === "") return { value: null, unit: null as "percent" | "number" | null };
  const text = String(value).trim();
  if (!text) return { value: null, unit: null as "percent" | "number" | null };
  if (text.endsWith("%")) {
    const parsed = Number(text.slice(0, -1).replace(/,/g, "").trim());
    if (!Number.isFinite(parsed)) throw new Error(`PROJECT_IMPORT_INVALID_MARGIN:${text}`);
    return { value: parsed, unit: "percent" as const };
  }
  const parsed = parseNumber(value);
  if (parsed === null) return { value: null, unit: null as "percent" | "number" | null };
  return percentStyle
    ? { value: parsed * 100, unit: "percent" as const }
    : { value: parsed, unit: "number" as const };
}

function textValue(value: CellValue) {
  if (value === null) return null;
  const text = String(value).trim();
  return text || null;
}

export function extractHistoricalProjectWorkbook(
  bytes: Buffer,
  options: { sheet?: string | null; defaultStatus: HistoricalProjectStatus },
): HistoricalWorkbookExtraction {
  if (bytes.length === 0) throw new Error("PROJECT_IMPORT_EMPTY_WORKBOOK");
  const entries = unzip(bytes);
  const sheets = loadSheets(entries);
  const selected = options.sheet
    ? sheets.find((sheet) => sheet.name === options.sheet)
    : sheets[0];
  if (!selected) throw new Error(`PROJECT_IMPORT_WORKSHEET_NOT_FOUND:${options.sheet}`);
  const rows = parseRows(entries, selected.path);
  if (rows.length === 0) throw new Error("PROJECT_IMPORT_EMPTY_WORKSHEET");

  let headerRowNumber: number | null = null;
  let mapping = new Map<number, ImportKey>();
  let headers: string[] = [];

  for (const row of rows) {
    const candidate = new Map<number, ImportKey>();
    for (const [index, cell] of row.cells) {
      const key = ALIAS_TO_KEY.get(normalizeHeader(cell.value));
      if (key) candidate.set(index, key);
    }
    const keys = new Set(candidate.values());
    if (keys.has("customer") && keys.has("project_name")) {
      headerRowNumber = row.rowNumber;
      mapping = candidate;
      headers = Array.from(row.cells.entries())
        .sort(([a], [b]) => a - b)
        .map(([, cell]) => String(cell.value ?? ""));
      break;
    }
  }

  if (headerRowNumber === null) throw new Error("PROJECT_IMPORT_HEADER_ROW_NOT_FOUND");
  const requiredKeys = Object.keys(HEADER_ALIASES) as ImportKey[];
  const mappedKeys = new Set(mapping.values());
  const missing = requiredKeys.filter((key) => !mappedKeys.has(key));
  if (missing.length > 0) throw new Error(`PROJECT_IMPORT_MISSING_COLUMNS:${missing.join(",")}`);

  const result: HistoricalProjectImportRow[] = [];
  for (const row of rows) {
    if (row.rowNumber <= headerRowNumber) continue;
    const raw = {} as Record<ImportKey, CellValue>;
    const styles = {} as Record<ImportKey, { dateStyle: boolean; percentStyle: boolean }>;
    for (const [index, key] of mapping) {
      const cell = row.cells.get(index) ?? { value: null, dateStyle: false, percentStyle: false };
      raw[key] = cell.value;
      styles[key] = { dateStyle: cell.dateStyle, percentStyle: cell.percentStyle };
    }
    if (!Object.values(raw).some((value) => value !== null && value !== "")) continue;

    const margin = parseMargin(raw.profit_margin, styles.profit_margin.percentStyle);
    const normalizedWithoutHash = {
      row_number: row.rowNumber,
      customer: textValue(raw.customer),
      project_name: textValue(raw.project_name),
      project_address: textValue(raw.project_address),
      start_date: parseDate(raw.start_date, styles.start_date.dateStyle),
      end_date: parseDate(raw.end_date, styles.end_date.dateStyle),
      sales_rep: textValue(raw.sales_rep),
      initial_contract_price: parseNumber(raw.initial_contract_price),
      price_after_change_orders: parseNumber(raw.price_after_change_orders),
      profit_margin: margin.value,
      profit_margin_unit: margin.unit,
      target_status: options.defaultStatus,
      raw_payload: { ...raw },
    };

    const identity = {
      customer: normalizedWithoutHash.customer,
      project_name: normalizedWithoutHash.project_name,
      project_address: normalizedWithoutHash.project_address,
      start_date: normalizedWithoutHash.start_date,
      end_date: normalizedWithoutHash.end_date,
      sales_rep: normalizedWithoutHash.sales_rep,
      initial_contract_price: normalizedWithoutHash.initial_contract_price,
      price_after_change_orders: normalizedWithoutHash.price_after_change_orders,
      profit_margin: normalizedWithoutHash.profit_margin,
      profit_margin_unit: normalizedWithoutHash.profit_margin_unit,
    };

    result.push({
      ...normalizedWithoutHash,
      row_sha256: sha256(stableStringify(identity)),
    });
  }

  if (result.length === 0) throw new Error("PROJECT_IMPORT_NO_IMPORTABLE_ROWS");
  return {
    sheet: selected.name,
    sheets: sheets.map((sheet) => sheet.name),
    headers,
    rows: result,
  };
}

export function workbookSha256(bytes: Buffer) {
  return sha256(bytes);
}
