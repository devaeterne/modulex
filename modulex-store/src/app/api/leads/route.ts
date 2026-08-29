import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { submitStoreLead } from "@/lib/store/leads/submit";
import type { StoreLeadRequestKind, StoreLeadSubmission, StoreLeadType } from "@/lib/store/leads/types";

const MAX_BODY_BYTES = 32 * 1024;
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const OPTION_KEY_PATTERN = /^[a-z0-9]+(?:[a-z0-9_-]*[a-z0-9])?$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function text(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function strictText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return { value: "", valid: true };
  const normalized = value.trim();
  return { value: normalized, valid: normalized.length <= maxLength };
}

function textArray(value: unknown, maxItems: number) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string").map((item) => item.trim().slice(0, 120)).filter(Boolean).slice(0, maxItems);
}

function isValidIsoDate(value: string) {
  if (!value) return true;
  if (!DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export async function POST(request: NextRequest) {
  const contentLength = Number(request.headers.get("content-length") || "0");
  if (contentLength > MAX_BODY_BYTES) return NextResponse.json({ error: "Request is too large." }, { status: 413 });

  const origin = request.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host !== request.nextUrl.host) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
    } catch {
      return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
    }
  }

  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }

  const leadType = text(body.lead_type, 40) as StoreLeadType;
  const requestKind = (leadType === "contact" ? text(body.request_kind, 40) || "general_inquiry" : "general_inquiry") as StoreLeadRequestKind;
  const firstName = text(body.first_name, 120);
  const lastName = text(body.last_name, 120);
  const email = text(body.email, 320).toLowerCase();
  const companyName = text(body.company_name, 200);
  const privacyAccepted = body.privacy_accepted === true;
  const supportingDocumentCount = typeof body.supporting_document_count === "number" && Number.isInteger(body.supporting_document_count)
    ? body.supporting_document_count
    : 0;

  const projectType = strictText(body.project_type, 64);
  const consultationIntent = strictText(body.consultation_intent, 64);
  const projectAddress = strictText(body.project_address, 300);
  const projectCity = strictText(body.project_city, 160);
  const projectPostalCode = strictText(body.project_postal_code, 32);
  const preferredDate = strictText(body.preferred_consultation_date, 10);
  const hasProjectFields = Boolean(projectType.value || consultationIntent.value || projectAddress.value || projectCity.value || projectPostalCode.value || preferredDate.value);

  if (!(["contact", "dealer_application"] as StoreLeadType[]).includes(leadType)) return NextResponse.json({ error: "Invalid request type." }, { status: 400 });
  if (!(["general_inquiry", "project_consultation"] as StoreLeadRequestKind[]).includes(requestKind)) return NextResponse.json({ error: "Invalid request kind." }, { status: 400 });
  if (!firstName || !lastName) return NextResponse.json({ error: "First and last name are required." }, { status: 400 });
  if (!EMAIL_PATTERN.test(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  if (!privacyAccepted) return NextResponse.json({ error: "Privacy acknowledgement is required." }, { status: 400 });
  if (leadType === "dealer_application" && !companyName) return NextResponse.json({ error: "Company name is required." }, { status: 400 });
  if (supportingDocumentCount < 0 || supportingDocumentCount > 4 || (leadType !== "dealer_application" && supportingDocumentCount > 0)) {
    return NextResponse.json({ error: "Invalid supporting document request." }, { status: 400 });
  }
  if (![projectType, consultationIntent, projectAddress, projectCity, projectPostalCode, preferredDate].every((item) => item.valid)) {
    return NextResponse.json({ error: "Project consultation field is too long." }, { status: 400 });
  }
  if ((projectType.value && !OPTION_KEY_PATTERN.test(projectType.value)) || (consultationIntent.value && !OPTION_KEY_PATTERN.test(consultationIntent.value))) {
    return NextResponse.json({ error: "Invalid project consultation option." }, { status: 400 });
  }
  if (!isValidIsoDate(preferredDate.value)) return NextResponse.json({ error: "Invalid preferred consultation date." }, { status: 400 });
  if (leadType === "dealer_application" && hasProjectFields) return NextResponse.json({ error: "Project consultation fields are not valid for dealer applications." }, { status: 400 });
  if (leadType === "contact" && requestKind === "general_inquiry" && hasProjectFields) return NextResponse.json({ error: "Project consultation fields require a project consultation request." }, { status: 400 });

  const documentUploadToken = supportingDocumentCount > 0 ? randomBytes(32).toString("hex") : undefined;
  const payload: StoreLeadSubmission = {
    lead_type: leadType, request_kind: requestKind, first_name: firstName, last_name: lastName, email,
    phone: text(body.phone, 80), company_name: companyName, company_website: text(body.company_website, 500),
    country_code: text(body.country_code, 2).toUpperCase(), city: text(body.city, 160), address: text(body.address, 500),
    business_type: text(body.business_type, 160), has_showroom: typeof body.has_showroom === "boolean" ? body.has_showroom : undefined,
    sales_channels: textArray(body.sales_channels, 20), estimated_annual_volume: text(body.estimated_annual_volume, 160),
    product_interests: textArray(body.product_interests, 30), message: text(body.message, 5000),
    marketing_consent: body.marketing_consent === true, privacy_accepted: true, source: "website",
    utm_source: text(body.utm_source, 255), utm_medium: text(body.utm_medium, 255), utm_campaign: text(body.utm_campaign, 255),
    utm_content: text(body.utm_content, 255), utm_term: text(body.utm_term, 255), landing_page: text(body.landing_page, 1000),
    referrer: text(body.referrer, 1000), website_hp: text(body.website_hp, 255), document_upload_token: documentUploadToken,
    project_type: projectType.value || undefined,
    consultation_intent: consultationIntent.value || undefined,
    project_address: projectAddress.value || undefined,
    project_city: projectCity.value || undefined,
    project_postal_code: projectPostalCode.value || undefined,
    preferred_consultation_date: preferredDate.value || undefined,
  };

  try {
    const result = await submitStoreLead(payload);
    return NextResponse.json({ referenceCode: result.reference_code, documentUploadToken }, { status: 201 });
  } catch (error) {
    console.error("Unable to submit Store lead", error);
    return NextResponse.json({ error: "We could not submit your request right now. Please try again shortly." }, { status: 503 });
  }
}
