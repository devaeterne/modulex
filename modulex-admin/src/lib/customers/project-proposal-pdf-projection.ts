import type { GeneralSettings } from "@/lib/settings/types";
import type { CustomerProject } from "@/lib/customers/project-domain";
import type {
  ProjectProposal,
  ProjectProposalArea,
  ProjectProposalRevision,
  ProjectProposalRevisionState,
} from "@/lib/customers/project-proposal-domain";
import { formatDateOnly, formatDateTime, formatTimestampDate } from "@/lib/dates/usDate";

export type ProjectProposalPdfMeta = {
  label: string;
  value: string;
};

export type ProjectProposalPdfArea = {
  id: string;
  areaName: string;
  areaTypeName: string | null;
  details: ProjectProposalPdfMeta[];
  pricingGroupLabel: string | null;
  directAmount: number | null;
};

export type ProjectProposalPdfPriceEntry = {
  kind: "group" | "area";
  id: string;
  label: string;
  description: string | null;
  amount: number;
};

export type ProjectProposalPdfAcceptance = {
  acceptedName: string;
  acceptedEmail: string | null;
  acceptedAt: string;
  acceptanceMethod: string;
  signatureText: string | null;
};

export type ProjectProposalPdfProjection = {
  title: "Proposal / Estimate";
  proposalNumber: string;
  revisionNo: number;
  revisionState: ProjectProposalRevisionState;
  currencyCode: string;
  fileName: string;
  dates: ProjectProposalPdfMeta[];
  company: {
    name: string;
    lines: string[];
    primaryLogoUrl: string | null;
    secondaryLogoUrl: string | null;
  };
  customer: {
    name: string;
    lines: string[];
  };
  project: {
    number: string;
    name: string;
    jobSiteLines: string[];
  };
  customerMessage: string | null;
  areas: ProjectProposalPdfArea[];
  pricing: ProjectProposalPdfPriceEntry[];
  proposalTotal: number;
  termsText: string | null;
  acceptance: ProjectProposalPdfAcceptance | null;
};

function compact(values: Array<string | null | undefined>) {
  return values.filter((value): value is string => Boolean(value?.trim()));
}

function textValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function addressLines(snapshot: Record<string, unknown> | null) {
  if (!snapshot) return [];
  const city = textValue(snapshot.city);
  const region = textValue(snapshot.state_region);
  const postal = textValue(snapshot.postal_code);
  const cityLine = compact([city, region]).join(", ") + (postal ? ` ${postal}` : "");
  return compact([
    textValue(snapshot.address_name),
    textValue(snapshot.company_name),
    textValue(snapshot.contact_name),
    textValue(snapshot.address_line_1),
    textValue(snapshot.address_line_2),
    cityLine.trim() || null,
    textValue(snapshot.country_code),
    textValue(snapshot.phone),
  ]);
}

function companyLines(settings: GeneralSettings) {
  const cityLine = compact([settings.city, settings.state_region]).join(", ") + (settings.postal_code ? ` ${settings.postal_code}` : "");
  return compact([
    settings.legal_name || settings.company_name,
    settings.address_line_1,
    settings.address_line_2,
    cityLine.trim() || null,
    settings.country_code,
    settings.phone ? `P ${settings.phone}` : null,
    settings.email,
    settings.website,
  ]);
}

function formattedDate(value: string | null | undefined, settings: GeneralSettings) {
  if (!value) return null;
  const formatted = formatTimestampDate(value, { timeZone: settings.timezone || "UTC" });
  return formatted === "—" ? null : formatted;
}

function formattedDateOnly(value: string | null | undefined) {
  if (!value) return null;
  const formatted = formatDateOnly(value);
  return formatted === "—" ? null : formatted;
}

function quantity(value: number | null, suffix = "") {
  return value === null ? null : `${value}${suffix}`;
}

function areaDetails(area: ProjectProposalArea): ProjectProposalPdfMeta[] {
  const entries: Array<ProjectProposalPdfMeta | null> = [
    area.materialDescription ? { label: "Material", value: area.materialDescription } : null,
    area.finish ? { label: "Finish", value: area.finish } : null,
    area.thickness ? { label: "Thickness", value: area.thickness } : null,
    area.sqFt !== null ? { label: "Square Feet", value: quantity(area.sqFt, " sq ft")! } : null,
    area.linearFt !== null ? { label: "Linear Feet", value: quantity(area.linearFt, " lf")! } : null,
    area.edgeProfile ? { label: "Edge Profile", value: area.edgeProfile } : null,
    area.edgeLinearFt !== null ? { label: "Edge Length", value: quantity(area.edgeLinearFt, " lf")! } : null,
    area.backsplash ? { label: "Backsplash", value: area.backsplash } : null,
    area.backsplashNotes ? { label: "Backsplash Notes", value: area.backsplashNotes } : null,
    area.sinkQuantity !== null ? { label: "Sink Quantity", value: String(area.sinkQuantity) } : null,
    area.sinkSource ? { label: "Sink", value: area.sinkSource } : null,
    area.sinkCutoutQuantity !== null ? { label: "Sink Cutouts", value: String(area.sinkCutoutQuantity) } : null,
    area.sinkTemplateStatus ? { label: "Sink Template", value: area.sinkTemplateStatus } : null,
    area.scopeNotes ? { label: "Scope", value: area.scopeNotes } : null,
  ];
  return entries.filter((entry): entry is ProjectProposalPdfMeta => entry !== null);
}

function pricingEntries(revision: ProjectProposalRevision): ProjectProposalPdfPriceEntry[] {
  const grouped = [...revision.pricingGroups]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
    .map((group) => ({
      kind: "group" as const,
      id: group.id,
      label: group.label,
      description: group.description,
      amount: group.sellAmount,
    }));

  const direct = [...revision.areas]
    .filter((area) => !area.pricingGroupId && area.directSellAmount !== null)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.areaName.localeCompare(b.areaName))
    .map((area) => ({
      kind: "area" as const,
      id: area.id,
      label: area.areaName,
      description: null,
      amount: area.directSellAmount!,
    }));

  return [...grouped, ...direct];
}

function safeFilePart(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "Proposal";
}

export function buildProjectProposalPdfProjection(input: {
  project: CustomerProject;
  proposal: ProjectProposal;
  revision: ProjectProposalRevision;
  settings: GeneralSettings;
}): ProjectProposalPdfProjection {
  const { project, proposal, revision, settings } = input;

  if (!proposal.revisions.some((entry) => entry.id === revision.id)) {
    throw new Error("Proposal revision does not belong to this Proposal.");
  }
  if (proposal.projectId !== project.id) {
    throw new Error("Proposal does not belong to this Project.");
  }

  const groupLabels = new Map(revision.pricingGroups.map((group) => [group.id, group.label]));
  const areas = [...revision.areas]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.areaName.localeCompare(b.areaName))
    .map((area): ProjectProposalPdfArea => ({
      id: area.id,
      areaName: area.areaName,
      areaTypeName: area.areaTypeName,
      details: areaDetails(area),
      pricingGroupLabel: area.pricingGroupId ? groupLabels.get(area.pricingGroupId) ?? null : null,
      directAmount: area.pricingGroupId ? null : area.directSellAmount,
    }));

  const dates: ProjectProposalPdfMeta[] = [];
  const createdDate = formattedDate(proposal.createdAt, settings);
  const validDate = formattedDateOnly(revision.validUntil);
  const sentDate = formattedDate(revision.sentAt, settings);
  const acceptedDate = formattedDate(revision.acceptedAt, settings);
  if (createdDate) dates.push({ label: "Proposal Date", value: createdDate });
  if (validDate) dates.push({ label: "Valid Until", value: validDate });
  if (sentDate) dates.push({ label: "Sent", value: sentDate });
  if (acceptedDate) dates.push({ label: "Accepted", value: acceptedDate });

  return {
    title: "Proposal / Estimate",
    proposalNumber: proposal.proposalNumber,
    revisionNo: revision.revisionNo,
    revisionState: revision.state,
    currencyCode: revision.currencyCode,
    fileName: `Proposal-${safeFilePart(proposal.proposalNumber)}-R${revision.revisionNo}.pdf`,
    dates,
    company: {
      name: settings.company_name,
      lines: companyLines(settings),
      primaryLogoUrl: settings.primary_logo_on_light_url || settings.logo_url,
      secondaryLogoUrl: settings.secondary_logo_on_light_url,
    },
    customer: {
      name: project.customer_name,
      lines: compact([project.customer_name]),
    },
    project: {
      number: project.project_number,
      name: project.name,
      jobSiteLines: addressLines(project.project_address_snapshot),
    },
    customerMessage: revision.customerMessage,
    areas,
    pricing: pricingEntries(revision),
    proposalTotal: revision.proposalTotal,
    termsText: revision.termsText,
    acceptance: revision.acceptance ? {
      acceptedName: revision.acceptance.acceptedName,
      acceptedEmail: revision.acceptance.acceptedEmail,
      acceptedAt: formatDateTime(revision.acceptance.acceptedAt, { timeZone: settings.timezone || "UTC" }),
      acceptanceMethod: revision.acceptance.acceptanceMethod,
      signatureText: revision.acceptance.signatureText,
    } : null,
  };
}
