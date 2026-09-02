import type { GeneralSettings } from "@/lib/settings/types";
import type { CommercialDocument, CommercialDocumentLine } from "@/lib/documents/types";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 42;
const PRIMARY_LOGO_BOX = { x: 238, y: 755, maxWidth: 112, maxHeight: 45 } as const;
const SECONDARY_LOGO_BOX = { x: 397, y: 746, maxWidth: 140, maxHeight: 62 } as const;
const FIRST_PAGE_LINE_HEIGHT = 270;
const CONTINUATION_PAGE_LINE_HEIGHT = 370;
const encoder = new TextEncoder();

type PdfImage = { bytes: Uint8Array; width: number; height: number };
type PdfObject = string | Uint8Array;

function ascii(value: string) {
  return encoder.encode(value);
}

function concatBytes(parts: Uint8Array[]) {
  const size = parts.reduce((total, part) => total + part.length, 0);
  const output = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function clean(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function escapePdf(value: string) {
  return clean(value).replace(/([\\()])/g, "\\$1");
}

function text(value: string, x: number, y: number, size = 9, bold = false) {
  return `BT /${bold ? "F2" : "F1"} ${size} Tf 0.12 g 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${escapePdf(value)}) Tj ET\n`;
}

function line(x1: number, y1: number, x2: number, y2: number, width = 0.5) {
  return `${width} w 0.78 G ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S\n`;
}

function imageCommand(name: string, image: PdfImage | null, x: number, y: number, maxWidth: number, maxHeight: number) {
  if (!image) return "";
  const ratio = Math.min(maxWidth / image.width, maxHeight / image.height);
  const width = image.width * ratio;
  const height = image.height * ratio;
  const centeredX = x + (maxWidth - width) / 2;
  const centeredY = y + (maxHeight - height) / 2;
  return `q ${width.toFixed(2)} 0 0 ${height.toFixed(2)} ${centeredX.toFixed(2)} ${centeredY.toFixed(2)} cm /${name} Do Q\n`;
}

function wrap(value: string, maxChars: number) {
  const words = clean(value).split(" ").filter(Boolean);
  if (!words.length) return [];
  const rows: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars && current) {
      rows.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) rows.push(current);
  return rows;
}

function cropWhiteMargins(source: HTMLCanvasElement) {
  const context = source.getContext("2d");
  if (!context) return source;
  const { width, height } = source;
  const pixels = context.getImageData(0, 0, width, height).data;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const alpha = pixels[index + 3];
      const isNearWhite = pixels[index] > 247 && pixels[index + 1] > 247 && pixels[index + 2] > 247;
      if (alpha > 12 && !isNearWhite) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (maxX < minX || maxY < minY) return source;
  const padding = Math.max(2, Math.round(Math.min(width, height) * 0.015));
  const sx = Math.max(0, minX - padding);
  const sy = Math.max(0, minY - padding);
  const sw = Math.min(width - sx, maxX - minX + 1 + padding * 2);
  const sh = Math.min(height - sy, maxY - minY + 1 + padding * 2);
  if (sw >= width * 0.96 && sh >= height * 0.96) return source;

  const cropped = document.createElement("canvas");
  cropped.width = Math.max(1, sw);
  cropped.height = Math.max(1, sh);
  const croppedContext = cropped.getContext("2d");
  if (!croppedContext) return source;
  croppedContext.fillStyle = "#ffffff";
  croppedContext.fillRect(0, 0, cropped.width, cropped.height);
  croppedContext.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);
  return cropped;
}

async function loadImage(url: string | null | undefined): Promise<PdfImage | null> {
  if (!url || typeof window === "undefined") return null;
  try {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    const loaded = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Logo could not be loaded."));
    });
    image.src = url;
    await loaded;

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, image.naturalWidth);
    canvas.height = Math.max(1, image.naturalHeight);
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0);
    const normalizedCanvas = cropWhiteMargins(canvas);
    const blob = await new Promise<Blob | null>((resolve) => normalizedCanvas.toBlob(resolve, "image/jpeg", 0.9));
    if (!blob) return null;
    return { bytes: new Uint8Array(await blob.arrayBuffer()), width: normalizedCanvas.width, height: normalizedCanvas.height };
  } catch {
    return null;
  }
}

function companyLines(settings: GeneralSettings) {
  return [
    settings.legal_name || settings.company_name,
    settings.address_line_1,
    settings.address_line_2,
    [settings.city, settings.state_region, settings.postal_code].filter(Boolean).join(", "),
    settings.country_code,
    settings.phone ? `P ${settings.phone}` : null,
    settings.email,
    settings.website,
  ].filter((value): value is string => Boolean(value && value.trim()));
}

function renderHeader(settings: GeneralSettings, primary: PdfImage | null, secondary: PdfImage | null) {
  let commands = "";
  let y = 794;
  for (const entry of companyLines(settings).slice(0, 8)) {
    commands += text(entry, MARGIN, y, y === 794 ? 9.5 : 8, y === 794);
    y -= 12;
  }
  commands += imageCommand("ImPrimary", primary, PRIMARY_LOGO_BOX.x, PRIMARY_LOGO_BOX.y, PRIMARY_LOGO_BOX.maxWidth, PRIMARY_LOGO_BOX.maxHeight);
  commands += imageCommand("ImSecondary", secondary, SECONDARY_LOGO_BOX.x, SECONDARY_LOGO_BOX.y, SECONDARY_LOGO_BOX.maxWidth, SECONDARY_LOGO_BOX.maxHeight);
  commands += line(MARGIN, 720, PAGE_WIDTH - MARGIN, 720, 0.8);
  return commands;
}

function renderParty(title: string, values: string[], x: number, y: number) {
  let commands = text(title.toUpperCase(), x, y, 7.5, true);
  let cursor = y - 16;
  for (const value of values.slice(0, 7)) {
    for (const row of wrap(value, 42).slice(0, 2)) {
      commands += text(row, x, cursor, 8.5, false);
      cursor -= 11;
    }
  }
  return commands;
}

function renderTableHeader(y: number) {
  let commands = line(MARGIN, y + 9, PAGE_WIDTH - MARGIN, y + 9, 0.8);
  commands += text("#", MARGIN + 2, y, 7.5, true);
  commands += text("SKU", MARGIN + 22, y, 7.5, true);
  commands += text("DESCRIPTION", MARGIN + 92, y, 7.5, true);
  commands += text("QTY", 375, y, 7.5, true);
  commands += text("UNIT PRICE", 410, y, 7.5, true);
  commands += text("DISCOUNT", 474, y, 7.5, true);
  commands += text("TOTAL", 536, y, 7.5, true);
  commands += line(MARGIN, y - 7, PAGE_WIDTH - MARGIN, y - 7, 0.5);
  return commands;
}

function descriptionRows(item: CommercialDocumentLine) {
  return wrap(item.description, 42).slice(0, 2);
}

function detailRows(item: CommercialDocumentLine) {
  if (!item.detail) return [];
  return item.detail
    .split(/\r?\n/)
    .flatMap((entry) => wrap(entry, 42))
    .slice(0, 8);
}

function rowHeight(item: CommercialDocumentLine) {
  const descriptionCount = Math.max(1, descriptionRows(item).length);
  const details = detailRows(item).length;
  return Math.max(29, 13 + descriptionCount * 10 + details * 9);
}

function renderLine(item: CommercialDocumentLine, y: number) {
  const height = rowHeight(item);
  const descriptions = descriptionRows(item);
  const details = detailRows(item);
  let commands = text(item.lineNo, MARGIN + 2, y, 7.5);
  commands += text(item.sku, MARGIN + 22, y, 7.5, true);

  const visibleDescriptions = descriptions.length ? descriptions : [""];
  visibleDescriptions.forEach((row, index) => {
    commands += text(row, MARGIN + 92, y - index * 10, 7.5);
  });
  const detailStartY = y - visibleDescriptions.length * 10;
  details.forEach((row, index) => {
    commands += text(row, MARGIN + 92, detailStartY - index * 9, 6.8);
  });

  commands += text(item.quantity, 377, y, 7.5);
  commands += text(item.unitPrice, 410, y, 7.5);
  commands += text(item.discount, 476, y, 7.5);
  commands += text(item.total, 522, y, 7.5, true);
  commands += line(MARGIN, y - height + 7, PAGE_WIDTH - MARGIN, y - height + 7, 0.35);
  return { commands, height };
}

function pageChunks(lines: CommercialDocumentLine[]) {
  if (lines.length === 0) return [[]];
  const chunks: CommercialDocumentLine[][] = [];
  let current: CommercialDocumentLine[] = [];
  let usedHeight = 0;
  let pageIndex = 0;

  for (const item of lines) {
    const height = rowHeight(item);
    const limit = pageIndex === 0 ? FIRST_PAGE_LINE_HEIGHT : CONTINUATION_PAGE_LINE_HEIGHT;
    if (current.length > 0 && usedHeight + height > limit) {
      chunks.push(current);
      current = [];
      usedHeight = 0;
      pageIndex += 1;
    }
    current.push(item);
    usedHeight += height;
  }

  if (current.length > 0) chunks.push(current);
  return chunks;
}

function buildPageContents(document: CommercialDocument, settings: GeneralSettings, primary: PdfImage | null, secondary: PdfImage | null) {
  const chunks = pageChunks(document.lines);
  const pages: string[] = [];

  chunks.forEach((items, pageIndex) => {
    const firstPage = pageIndex === 0;
    let commands = renderHeader(settings, primary, secondary);
    commands += text(document.title.toUpperCase(), MARGIN, 696, 12, true);
    commands += text(document.number, 410, 696, 15, true);

    let metaY = 676;
    for (const entry of document.meta.slice(0, 5)) {
      commands += text(`${entry.label}: ${entry.value}`, 410, metaY, 8);
      metaY -= 12;
    }

    let tableY = 650;
    if (firstPage) {
      commands += renderParty(document.billTo.title, document.billTo.lines, MARGIN, 660);
      if (document.shipTo) commands += renderParty(document.shipTo.title, document.shipTo.lines, 225, 660);
      let infoY = 660;
      for (const entry of (document.information ?? []).slice(0, 5)) {
        commands += text(`${entry.label}: ${entry.value}`, 410, infoY, 8);
        infoY -= 13;
      }
      tableY = 548;
    }

    commands += renderTableHeader(tableY);
    let rowY = tableY - 27;
    for (const item of items) {
      const rendered = renderLine(item, rowY);
      commands += rendered.commands;
      rowY -= rendered.height;
    }

    const lastPage = pageIndex === chunks.length - 1;
    if (lastPage) {
      let totalsY = Math.min(rowY - 8, 215);
      if (totalsY < 112) totalsY = 215;
      commands += line(355, totalsY + 18, PAGE_WIDTH - MARGIN, totalsY + 18, 0.8);
      for (const total of document.totals) {
        commands += text(total.label, 365, totalsY, total.strong ? 9.5 : 8, total.strong);
        commands += text(total.value, 485, totalsY, total.strong ? 10 : 8, total.strong);
        totalsY -= total.strong ? 19 : 15;
      }

      if (document.notes) {
        commands += text("NOTES", MARGIN, 182, 7.5, true);
        let noteY = 166;
        for (const row of wrap(document.notes, 72).slice(0, 5)) {
          commands += text(row, MARGIN, noteY, 7.5);
          noteY -= 11;
        }
      }

      if (document.footerNote) {
        commands += line(MARGIN, 78, PAGE_WIDTH - MARGIN, 78, 0.5);
        commands += text(wrap(document.footerNote, 95)[0] ?? "", MARGIN, 62, 6.8);
      }

      if (document.signatureLabels) {
        commands += line(MARGIN, 112, 235, 112, 0.5);
        commands += line(360, 112, PAGE_WIDTH - MARGIN, 112, 0.5);
        commands += text(document.signatureLabels[0], 92, 97, 7.5);
        commands += text(document.signatureLabels[1], 398, 97, 7.5);
      }
    }

    commands += text(`Page ${pageIndex + 1} / ${chunks.length}`, PAGE_WIDTH - 88, 28, 6.5);
    pages.push(commands);
  });

  return pages;
}

function streamObject(content: Uint8Array) {
  return concatBytes([
    ascii(`<< /Length ${content.length} >>\nstream\n`),
    content,
    ascii("\nendstream"),
  ]);
}

function imageObject(image: PdfImage) {
  const header = `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >>\nstream\n`;
  return concatBytes([ascii(header), image.bytes, ascii("\nendstream")]);
}

function makePdf(pageContents: string[], primary: PdfImage | null, secondary: PdfImage | null) {
  const objects: PdfObject[] = ["", "", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>"];
  const addObject = (value: PdfObject) => {
    objects.push(value);
    return objects.length;
  };

  const primaryRef = primary ? addObject(imageObject(primary)) : null;
  const secondaryRef = secondary ? addObject(imageObject(secondary)) : null;
  const pageRefs: number[] = [];

  for (const content of pageContents) {
    const contentRef = addObject(streamObject(ascii(content)));
    const xObjects = [
      primaryRef ? `/ImPrimary ${primaryRef} 0 R` : "",
      secondaryRef ? `/ImSecondary ${secondaryRef} 0 R` : "",
    ].filter(Boolean).join(" ");
    const resourceImages = xObjects ? `/XObject << ${xObjects} >>` : "";
    const pageRef = addObject(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> ${resourceImages} >> /Contents ${contentRef} 0 R >>`);
    pageRefs.push(pageRef);
  }

  objects[0] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[1] = `<< /Type /Pages /Kids [${pageRefs.map((ref) => `${ref} 0 R`).join(" ")}] /Count ${pageRefs.length} >>`;

  const parts: Uint8Array[] = [ascii("%PDF-1.4\n%Modulex\n")];
  const offsets = [0];
  let currentOffset = parts[0].length;

  objects.forEach((object, index) => {
    offsets[index + 1] = currentOffset;
    const start = ascii(`${index + 1} 0 obj\n`);
    const body = typeof object === "string" ? ascii(object) : object;
    const end = ascii("\nendobj\n");
    parts.push(start, body, end);
    currentOffset += start.length + body.length + end.length;
  });

  const xrefOffset = currentOffset;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objects.length; index += 1) {
    xref += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  parts.push(ascii(xref));
  return concatBytes(parts);
}

export async function buildCommercialDocumentPdf(document: CommercialDocument, settings: GeneralSettings) {
  const primaryUrl = settings.primary_logo_on_light_url || settings.logo_url;
  const secondaryUrl = settings.secondary_logo_on_light_url;
  const [primary, secondary] = await Promise.all([loadImage(primaryUrl), loadImage(secondaryUrl)]);
  const pages = buildPageContents(document, settings, primary, secondary);
  const bytes = makePdf(pages, primary, secondary);
  return new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
}

export async function downloadCommercialDocumentPdf(document: CommercialDocument, settings: GeneralSettings) {
  const blob = await buildCommercialDocumentPdf(document, settings);
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = document.fileName;
  anchor.rel = "noopener";
  window.document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
