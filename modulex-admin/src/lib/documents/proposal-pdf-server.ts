import sharp from "sharp";
import type { ProjectProposalPdfProjection } from "@/lib/customers/project-proposal-pdf-projection";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 42;
const CONTENT_BOTTOM = 54;
const HEADER_RULE_Y = 720;
const encoder = new TextEncoder();

type PdfImage = { bytes: Uint8Array; width: number; height: number };
type PdfObject = string | Uint8Array;
type PageState = { commands: string; y: number };

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
    .replace(/[ \t]+/g, " ")
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

function wrapLine(value: string, maxChars: number) {
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

function wrap(value: string, maxChars: number) {
  return value
    .split(/\r?\n/)
    .flatMap((entry) => wrapLine(entry, maxChars).length ? wrapLine(entry, maxChars) : [""]);
}

function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
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

function isAllowedLogoUrl(value: string) {
  const configuredSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!configuredSupabaseUrl) return false;
  try {
    const candidate = new URL(value);
    const supabaseOrigin = new URL(configuredSupabaseUrl);
    return candidate.origin === supabaseOrigin.origin
      && candidate.pathname.startsWith("/storage/v1/object/public/company-assets/");
  } catch {
    return false;
  }
}

async function loadServerLogo(url: string | null): Promise<PdfImage | null> {
  if (!url || !isAllowedLogoUrl(url)) return null;
  try {
    const response = await fetch(url, { cache: "no-store", redirect: "error" });
    if (!response.ok) return null;
    const input = Buffer.from(await response.arrayBuffer());
    const normalized = await sharp(input)
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 90 })
      .toBuffer({ resolveWithObject: true });
    const width = normalized.info.width;
    const height = normalized.info.height;
    if (!width || !height) return null;
    return { bytes: new Uint8Array(normalized.data), width, height };
  } catch {
    return null;
  }
}

function renderHeader(
  projection: ProjectProposalPdfProjection,
  primary: PdfImage | null,
  secondary: PdfImage | null,
) {
  let commands = "";
  let y = 796;
  for (const entry of projection.company.lines) {
    for (const row of wrap(entry, 38)) {
      commands += text(row, MARGIN, y, y === 796 ? 9.5 : 7.6, y === 796);
      y -= 11;
    }
  }

  if (secondary) {
    commands += imageCommand("ImSecondary", secondary, 220, 744, 155, 62);
    commands += imageCommand("ImPrimary", primary, 410, 754, 140, 45);
  } else if (primary) {
    commands += imageCommand("ImPrimary", primary, 220, 744, 155, 62);
  } else {
    commands += text(projection.company.name, 225, 774, 13, true);
  }

  commands += line(MARGIN, HEADER_RULE_Y, PAGE_WIDTH - MARGIN, HEADER_RULE_Y, 0.8);
  return commands;
}

function pageStart(
  projection: ProjectProposalPdfProjection,
  primary: PdfImage | null,
  secondary: PdfImage | null,
  continuation: boolean,
): PageState {
  let commands = renderHeader(projection, primary, secondary);
  commands += text(projection.title.toUpperCase(), MARGIN, 697, 12, true);
  commands += text(projection.proposalNumber, 405, 697, 14, true);
  commands += text(`Revision ${projection.revisionNo} · ${clean(projection.revisionState).replace(/_/g, " ").toUpperCase()}`, 405, 681, 8);
  if (continuation) commands += text("CONTINUED", MARGIN, 681, 7.5, true);
  return { commands, y: 656 };
}

function ensureSpace(
  pages: PageState[],
  current: PageState,
  needed: number,
  projection: ProjectProposalPdfProjection,
  primary: PdfImage | null,
  secondary: PdfImage | null,
) {
  if (current.y - needed >= CONTENT_BOTTOM) return current;
  pages.push(current);
  return pageStart(projection, primary, secondary, true);
}

function addWrappedText(
  pages: PageState[],
  current: PageState,
  value: string,
  options: {
    x?: number;
    maxChars?: number;
    size?: number;
    bold?: boolean;
    lineHeight?: number;
    gapAfter?: number;
  },
  projection: ProjectProposalPdfProjection,
  primary: PdfImage | null,
  secondary: PdfImage | null,
) {
  const x = options.x ?? MARGIN;
  const rows = wrap(value, options.maxChars ?? 88);
  const lineHeight = options.lineHeight ?? 11;
  for (const row of rows) {
    current = ensureSpace(pages, current, lineHeight + 4, projection, primary, secondary);
    current.commands += text(row, x, current.y, options.size ?? 8.2, options.bold ?? false);
    current.y -= lineHeight;
  }
  current.y -= options.gapAfter ?? 0;
  return current;
}

function addSectionHeading(
  pages: PageState[],
  current: PageState,
  label: string,
  projection: ProjectProposalPdfProjection,
  primary: PdfImage | null,
  secondary: PdfImage | null,
) {
  current = ensureSpace(pages, current, 30, projection, primary, secondary);
  current.commands += line(MARGIN, current.y + 8, PAGE_WIDTH - MARGIN, current.y + 8, 0.45);
  current.commands += text(label.toUpperCase(), MARGIN, current.y - 5, 8, true);
  current.y -= 25;
  return current;
}

function addLabelValue(
  pages: PageState[],
  current: PageState,
  label: string,
  value: string,
  projection: ProjectProposalPdfProjection,
  primary: PdfImage | null,
  secondary: PdfImage | null,
) {
  const rows = wrap(`${label}: ${value}`, 86);
  for (const row of rows) {
    current = ensureSpace(pages, current, 13, projection, primary, secondary);
    current.commands += text(row, MARGIN + 10, current.y, 8);
    current.y -= 11;
  }
  return current;
}

function renderFirstPageSummary(
  pages: PageState[],
  current: PageState,
  projection: ProjectProposalPdfProjection,
  primary: PdfImage | null,
  secondary: PdfImage | null,
) {
  current.commands += text("CUSTOMER", MARGIN, current.y, 7.5, true);
  current.commands += text("PROJECT / JOB SITE", 300, current.y, 7.5, true);
  current.y -= 17;

  const customerRows = projection.customer.lines.flatMap((entry) => wrap(entry, 40));
  const projectRows = [
    `${projection.project.number} · ${projection.project.name}`,
    ...projection.project.jobSiteLines,
  ].flatMap((entry) => wrap(entry, 42));
  const rowCount = Math.max(customerRows.length, projectRows.length, 1);
  for (let index = 0; index < rowCount; index += 1) {
    current = ensureSpace(pages, current, 13, projection, primary, secondary);
    if (customerRows[index]) current.commands += text(customerRows[index], MARGIN, current.y, 8.2);
    if (projectRows[index]) current.commands += text(projectRows[index], 300, current.y, 8.2);
    current.y -= 11;
  }

  current.y -= 5;
  for (const entry of projection.dates) {
    current = addLabelValue(pages, current, entry.label, entry.value, projection, primary, secondary);
  }
  current = addLabelValue(pages, current, "Currency", projection.currencyCode, projection, primary, secondary);
  current.y -= 7;
  return current;
}

function renderArea(
  pages: PageState[],
  current: PageState,
  area: ProjectProposalPdfProjection["areas"][number],
  projection: ProjectProposalPdfProjection,
  primary: PdfImage | null,
  secondary: PdfImage | null,
) {
  current = ensureSpace(pages, current, 45, projection, primary, secondary);
  const heading = area.areaTypeName ? `${area.areaName} · ${area.areaTypeName}` : area.areaName;
  current.commands += text(heading, MARGIN, current.y, 9.5, true);
  current.y -= 15;

  for (const detail of area.details) {
    current = addLabelValue(pages, current, detail.label, detail.value, projection, primary, secondary);
  }

  if (area.pricingGroupLabel) {
    current = addLabelValue(pages, current, "Pricing Group", area.pricingGroupLabel, projection, primary, secondary);
  } else if (area.directAmount !== null) {
    current = addLabelValue(
      pages,
      current,
      "Area Price",
      money(area.directAmount, projection.currencyCode),
      projection,
      primary,
      secondary,
    );
  }

  current.y -= 10;
  return current;
}

function renderPricing(
  pages: PageState[],
  current: PageState,
  projection: ProjectProposalPdfProjection,
  primary: PdfImage | null,
  secondary: PdfImage | null,
) {
  current = addSectionHeading(pages, current, "Pricing Summary", projection, primary, secondary);
  if (projection.pricing.length === 0) {
    current = addWrappedText(
      pages,
      current,
      "No priced scope items are listed for this revision.",
      { x: MARGIN + 10, maxChars: 82, size: 8 },
      projection,
      primary,
      secondary,
    );
  }

  for (const entry of projection.pricing) {
    current = ensureSpace(pages, current, entry.description ? 38 : 22, projection, primary, secondary);
    current.commands += text(entry.label, MARGIN + 10, current.y, 8.5, entry.kind === "group");
    current.commands += text(money(entry.amount, projection.currencyCode), 475, current.y, 8.5, true);
    current.y -= 12;
    if (entry.description) {
      current = addWrappedText(
        pages,
        current,
        entry.description,
        { x: MARGIN + 20, maxChars: 76, size: 7.4, lineHeight: 10 },
        projection,
        primary,
        secondary,
      );
    }
    current.y -= 4;
  }

  current = ensureSpace(pages, current, 42, projection, primary, secondary);
  current.commands += line(350, current.y + 9, PAGE_WIDTH - MARGIN, current.y + 9, 0.9);
  current.commands += text("PROPOSAL TOTAL", 360, current.y - 6, 10, true);
  current.commands += text(money(projection.proposalTotal, projection.currencyCode), 465, current.y - 6, 11, true);
  current.y -= 35;
  return current;
}

function renderAcceptance(
  pages: PageState[],
  current: PageState,
  projection: ProjectProposalPdfProjection,
  primary: PdfImage | null,
  secondary: PdfImage | null,
) {
  if (!projection.acceptance) return current;
  current = addSectionHeading(pages, current, "Acceptance", projection, primary, secondary);
  current = addLabelValue(pages, current, "Accepted By", projection.acceptance.acceptedName, projection, primary, secondary);
  if (projection.acceptance.acceptedEmail) {
    current = addLabelValue(pages, current, "Email", projection.acceptance.acceptedEmail, projection, primary, secondary);
  }
  current = addLabelValue(pages, current, "Accepted At", projection.acceptance.acceptedAt, projection, primary, secondary);
  current = addLabelValue(pages, current, "Method", projection.acceptance.acceptanceMethod, projection, primary, secondary);
  if (projection.acceptance.signatureText) {
    current = addLabelValue(pages, current, "Signature", projection.acceptance.signatureText, projection, primary, secondary);
  }
  return current;
}

function buildPageContents(
  projection: ProjectProposalPdfProjection,
  primary: PdfImage | null,
  secondary: PdfImage | null,
) {
  const pages: PageState[] = [];
  let current = pageStart(projection, primary, secondary, false);
  current = renderFirstPageSummary(pages, current, projection, primary, secondary);

  if (projection.customerMessage) {
    current = addSectionHeading(pages, current, "Message", projection, primary, secondary);
    current = addWrappedText(
      pages,
      current,
      projection.customerMessage,
      { maxChars: 88, size: 8.2, lineHeight: 11, gapAfter: 8 },
      projection,
      primary,
      secondary,
    );
  }

  current = addSectionHeading(pages, current, "Scope by Area", projection, primary, secondary);
  if (projection.areas.length === 0) {
    current = addWrappedText(
      pages,
      current,
      "No customer-facing Area scope is listed for this revision.",
      { x: MARGIN + 10, maxChars: 82, size: 8 },
      projection,
      primary,
      secondary,
    );
  }
  for (const area of projection.areas) {
    current = renderArea(pages, current, area, projection, primary, secondary);
  }

  current = renderPricing(pages, current, projection, primary, secondary);

  if (projection.termsText) {
    current = addSectionHeading(pages, current, "Terms", projection, primary, secondary);
    current = addWrappedText(
      pages,
      current,
      projection.termsText,
      { maxChars: 88, size: 7.8, lineHeight: 10.5, gapAfter: 8 },
      projection,
      primary,
      secondary,
    );
  }

  current = renderAcceptance(pages, current, projection, primary, secondary);
  pages.push(current);

  return pages.map((page, index) => `${page.commands}${text(`Page ${index + 1} / ${pages.length}`, PAGE_WIDTH - 88, 28, 6.5)}`);
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
  const objects: PdfObject[] = [
    "",
    "",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
  ];
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
    pageRefs.push(addObject(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> ${resourceImages} >> /Contents ${contentRef} 0 R >>`,
    ));
  }

  objects[0] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[1] = `<< /Type /Pages /Kids [${pageRefs.map((ref) => `${ref} 0 R`).join(" ")}] /Count ${pageRefs.length} >>`;

  const parts: Uint8Array[] = [ascii("%PDF-1.4\n%Modulex Proposal\n")];
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

export async function renderProjectProposalPdf(
  projection: ProjectProposalPdfProjection,
): Promise<Uint8Array> {
  const [primary, secondary] = await Promise.all([
    loadServerLogo(projection.company.primaryLogoUrl),
    loadServerLogo(projection.company.secondaryLogoUrl),
  ]);
  const pages = buildPageContents(projection, primary, secondary);
  return makePdf(pages, primary, secondary);
}
