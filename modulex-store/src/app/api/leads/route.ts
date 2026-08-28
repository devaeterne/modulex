import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { submitStoreLead } from "@/lib/store/leads/submit";
import type { StoreLeadSubmission, StoreLeadType } from "@/lib/store/leads/types";

const MAX_BODY_BYTES = 32 * 1024;
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function text(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function textArray(value: unknown, maxItems: number) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string").map((item) => item.trim().slice(0, 120)).filter(Boolean).slice(0, maxItems);
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
  const firstName = text(body.first_name, 120);
  const lastName = text(body.last_name, 120);
  const email = text(body.email, 320).toLowerCase();
  const companyName = text(body.company_name, 200);
  const privacyAccepted = body.privacy_accepted === true;
  const supportingDocumentCount = typeof body.supporting_document_count === "number" && Number.isInteger(body.supporting_document_count)
    ? body.supporting_document_count
    : 0;

  if (!(["contact", "dealer_application"] as StoreLeadType[]).includes(leadType)) return NextResponse.json({ error: "Invalid request type." }, { status: 400 });
  if (!firstName || !lastName) return NextResponse.json({ error: "First and last name are required." }, { status: 400 });
  if (!EMAIL_PATTERN.test(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  if (!privacyAccepted) return NextResponse.json({ error: "Privacy acknowledgement is required." }, { status: 400 });
  if (leadType === "dealer_application" && !companyName) return NextResponse.json({ error: "Company name is required." }, { status: 400 });
  if (supportingDocumentCount < 0 || supportingDocumentCount > 4 || (leadType !== "dealer_application" && supportingDocumentCount > 0)) {
    return NextResponse.json({ error: "Invalid supporting document request." }, { status: 400 });
  }

  const documentUploadToken = supportingDocumentCount > 0 ? randomBytes(32).toString("hex") : undefined;
  const payload: StoreLeadSubmission = {
    lead_type: leadType, first_name: firstName, last_name: lastName, email,
    phone: text(body.phone, 80), company_name: companyName, company_website: text(body.company_website, 500),
    country_code: text(body.country_code, 2).toUpperCase(), city: text(body.city, 160), address: text(body.address, 500),
    business_type: text(body.business_type, 160), has_showroom: typeof body.has_showroom === "boolean" ? body.has_showroom : undefined,
    sales_channels: textArray(body.sales_channels, 20), estimated_annual_volume: text(body.estimated_annual_volume, 160),
    product_interests: textArray(body.product_interests, 30), message: text(body.message, 5000),
    marketing_consent: body.marketing_consent === true, privacy_accepted: true, source: "website",
    utm_source: text(body.utm_source, 255), utm_medium: text(body.utm_medium, 255), utm_campaign: text(body.utm_campaign, 255),
    utm_content: text(body.utm_content, 255), utm_term: text(body.utm_term, 255), landing_page: text(body.landing_page, 1000),
    referrer: text(body.referrer, 1000), website_hp: text(body.website_hp, 255), document_upload_token: documentUploadToken,
  };

  try {
    const result = await submitStoreLead(payload);
    return NextResponse.json({ referenceCode: result.reference_code, documentUploadToken }, { status: 201 });
  } catch (error) {
    console.error("Unable to submit Store lead", error);
    return NextResponse.json({ error: "We could not submit your request right now. Please try again shortly." }, { status: 503 });
  }
}
