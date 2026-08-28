"use client";

import { FormEvent, useRef, useState } from "react";
import type { StoreLeadType } from "@/lib/store/leads/types";
import { captureSessionAttribution, getSessionAttribution } from "@/lib/analytics/attribution";
import { pushAnalyticsEvent } from "@/lib/analytics/events";

type LeadFormProps = { type: StoreLeadType };
type DocumentType = "business_license" | "resale_certificate" | "showroom_company_documentation" | "other";

const salesChannels = ["Showroom", "Retail", "Trade / Contractor", "E-commerce", "Project Sales"];
const productInterests = ["Kitchen Cabinets", "Vanities", "Tall Cabinets", "Accessories", "Full Product Line"];
const allowedFileTypes = new Set(["application/pdf", "image/jpeg", "image/png"]);
const MAX_FILE_BYTES = 10 * 1024 * 1024;

export default function LeadForm({ type }: LeadFormProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [referenceCode, setReferenceCode] = useState<string | null>(null);
  const [documents, setDocuments] = useState<File[]>([]);
  const [documentType, setDocumentType] = useState<DocumentType>("other");
  const started = useRef(false);
  const dealer = type === "dealer_application";

  function markStarted() {
    if (started.current) return;
    started.current = true;
    pushAnalyticsEvent(dealer ? "dealer_application_start" : "contact_form_start", { form_type: type });
  }

  function selectDocuments(files: FileList | null) {
    const selected = Array.from(files ?? []).slice(0, 4);
    const invalid = selected.find((file) => !allowedFileTypes.has(file.type) || file.size < 1 || file.size > MAX_FILE_BYTES);
    if (invalid) {
      setDocuments([]);
      setError("Supporting documents must be PDF, JPG, or PNG files up to 10 MB each.");
      return;
    }
    setError(null);
    setDocuments(selected);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setReferenceCode(null);

    const form = event.currentTarget;
    const data = new FormData(form);
    captureSessionAttribution();
    const attribution = getSessionAttribution();
    const params = new URLSearchParams(window.location.search);
    const showroomValue = String(data.get("has_showroom") || "");
    const payload = {
      lead_type: type,
      first_name: String(data.get("first_name") || ""), last_name: String(data.get("last_name") || ""),
      email: String(data.get("email") || ""), phone: String(data.get("phone") || ""),
      company_name: String(data.get("company_name") || ""), company_website: String(data.get("company_website") || ""),
      country_code: String(data.get("country_code") || ""), city: String(data.get("city") || ""),
      business_type: String(data.get("business_type") || ""),
      has_showroom: showroomValue === "yes" ? true : showroomValue === "no" ? false : undefined,
      estimated_annual_volume: String(data.get("estimated_annual_volume") || ""),
      sales_channels: data.getAll("sales_channels").map(String), product_interests: data.getAll("product_interests").map(String),
      message: String(data.get("message") || ""), privacy_accepted: data.get("privacy_accepted") === "on",
      marketing_consent: data.get("marketing_consent") === "on", website_hp: String(data.get("website_hp") || ""),
      utm_source: attribution?.utmSource || params.get("utm_source") || "", utm_medium: attribution?.utmMedium || params.get("utm_medium") || "",
      utm_campaign: attribution?.utmCampaign || params.get("utm_campaign") || "", utm_content: attribution?.utmContent || params.get("utm_content") || "",
      utm_term: attribution?.utmTerm || params.get("utm_term") || "", landing_page: attribution?.landingPage || window.location.href,
      referrer: attribution?.referrer || document.referrer,
      supporting_document_count: dealer ? documents.length : 0,
    };

    try {
      const response = await fetch("/api/leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = (await response.json()) as { referenceCode?: string; documentUploadToken?: string; error?: string };
      if (!response.ok || !result.referenceCode) throw new Error(result.error || "Unable to submit your request.");

      setReferenceCode(result.referenceCode);
      if (documents.length > 0) {
        if (!result.documentUploadToken) throw new Error(`Application ${result.referenceCode} was submitted, but document upload could not be authorized.`);
        for (const file of documents) {
          const upload = new FormData();
          upload.set("token", result.documentUploadToken);
          upload.set("document_type", documentType);
          upload.set("file", file, file.name);
          const uploadResponse = await fetch("/api/leads/documents", { method: "POST", body: upload });
          if (!uploadResponse.ok) {
            const uploadResult = (await uploadResponse.json()) as { error?: string };
            throw new Error(`Application ${result.referenceCode} was submitted, but a supporting document failed to upload. ${uploadResult.error || "Please contact us with your reference."}`);
          }
        }
      }

      pushAnalyticsEvent(dealer ? "dealer_application_submit" : "contact_form_submit", { form_type: type });
      form.reset();
      setDocuments([]);
      setDocumentType("other");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to submit your request.");
    } finally { setSubmitting(false); }
  }

  return (
    <form className="contact-form" onSubmit={handleSubmit} onFocusCapture={markStarted} noValidate={false}>
      <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", width: 1, height: 1, overflow: "hidden" }}>
        <label htmlFor={`${type}-website-hp`}>Website</label><input id={`${type}-website-hp`} name="website_hp" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <div className="form-row">
        <div className="form-group"><label htmlFor={`${type}-first-name`}>First Name *</label><input id={`${type}-first-name`} name="first_name" type="text" maxLength={120} required autoComplete="given-name" /></div>
        <div className="form-group"><label htmlFor={`${type}-last-name`}>Last Name *</label><input id={`${type}-last-name`} name="last_name" type="text" maxLength={120} required autoComplete="family-name" /></div>
      </div>
      <div className="form-row">
        <div className="form-group"><label htmlFor={`${type}-email`}>Email *</label><input id={`${type}-email`} name="email" type="email" maxLength={320} required autoComplete="email" /></div>
        <div className="form-group"><label htmlFor={`${type}-phone`}>Phone</label><input id={`${type}-phone`} name="phone" type="tel" maxLength={80} autoComplete="tel" /></div>
      </div>
      {dealer ? <>
        <div className="form-row">
          <div className="form-group"><label htmlFor="dealer-company">Company Name *</label><input id="dealer-company" name="company_name" type="text" maxLength={200} required autoComplete="organization" /></div>
          <div className="form-group"><label htmlFor="dealer-website">Company Website</label><input id="dealer-website" name="company_website" type="url" maxLength={500} placeholder="https://" /></div>
        </div>
        <div className="form-row">
          <div className="form-group"><label htmlFor="dealer-country">Country Code</label><input id="dealer-country" name="country_code" type="text" maxLength={2} placeholder="US" autoComplete="country" /></div>
          <div className="form-group"><label htmlFor="dealer-city">City</label><input id="dealer-city" name="city" type="text" maxLength={160} autoComplete="address-level2" /></div>
        </div>
        <div className="form-row">
          <div className="form-group"><label htmlFor="dealer-business-type">Business Type</label><select id="dealer-business-type" name="business_type" defaultValue=""><option value="">Select</option><option value="Kitchen & Bath Dealer">Kitchen & Bath Dealer</option><option value="Cabinet Dealer">Cabinet Dealer</option><option value="Contractor / Builder">Contractor / Builder</option><option value="Designer / Architect">Designer / Architect</option><option value="Distributor">Distributor</option><option value="Other">Other</option></select></div>
          <div className="form-group"><label htmlFor="dealer-showroom">Do you operate a showroom?</label><select id="dealer-showroom" name="has_showroom" defaultValue=""><option value="">Select</option><option value="yes">Yes</option><option value="no">No</option></select></div>
        </div>
        <div className="form-group"><label htmlFor="dealer-volume">Estimated Annual Cabinet Volume</label><select id="dealer-volume" name="estimated_annual_volume" defaultValue=""><option value="">Select</option><option value="Under $100K">Under $100K</option><option value="$100K - $250K">$100K - $250K</option><option value="$250K - $500K">$250K - $500K</option><option value="$500K - $1M">$500K - $1M</option><option value="$1M+">$1M+</option></select></div>
        <fieldset className="form-group"><legend className="mb-2">Sales Channels</legend><div className="d-flex flex-wrap gap-3">{salesChannels.map((channel) => <label className="checkbox-label" key={channel}><input type="checkbox" name="sales_channels" value={channel} /><span>{channel}</span></label>)}</div></fieldset>
        <fieldset className="form-group"><legend className="mb-2">Product Interests</legend><div className="d-flex flex-wrap gap-3">{productInterests.map((interest) => <label className="checkbox-label" key={interest}><input type="checkbox" name="product_interests" value={interest} /><span>{interest}</span></label>)}</div></fieldset>
        <div className="form-row">
          <div className="form-group"><label htmlFor="dealer-document-type">Supporting document category</label><select id="dealer-document-type" value={documentType} onChange={(event) => setDocumentType(event.target.value as DocumentType)}><option value="other">Other supporting document</option><option value="business_license">Business license / registration</option><option value="resale_certificate">Resale certificate</option><option value="showroom_company_documentation">Showroom / company documentation</option></select></div>
          <div className="form-group"><label htmlFor="dealer-documents">Supporting documents (optional)</label><input id="dealer-documents" type="file" multiple accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={(event) => selectDocuments(event.target.files)} /><small className="d-block mt-2">Up to 4 PDF, JPG, or PNG files, 10 MB each. Documents are stored privately.</small></div>
        </div>
        {documents.length > 0 ? <div className="form-group"><ul className="mb-0">{documents.map((file) => <li key={`${file.name}-${file.size}`}>{file.name}</li>)}</ul></div> : null}
      </> : null}
      <div className="form-group"><label htmlFor={`${type}-message`}>{dealer ? "Tell us about your business" : "Message"} *</label><textarea id={`${type}-message`} name="message" rows={6} maxLength={5000} required /></div>
      <div className="form-group checkbox-group"><label className="checkbox-label"><input type="checkbox" name="privacy_accepted" required /><span>I agree that Oakwell Cabinetry may use this information to respond to my request. *</span></label></div>
      <div className="form-group checkbox-group"><label className="checkbox-label"><input type="checkbox" name="marketing_consent" /><span>I would also like to receive occasional Oakwell product and dealer updates.</span></label></div>
      {error ? <div className="alert alert-danger" role="alert">{error}</div> : null}
      {referenceCode ? <div className="alert alert-success" role="status" aria-live="polite">Thank you. Your request was submitted successfully. Reference: <strong>{referenceCode}</strong></div> : null}
      <button type="submit" className="btn-submit" disabled={submitting}><span>{submitting ? "Submitting..." : dealer ? "Submit Dealer Application" : "Send Inquiry"}</span><span className="submit-icon" aria-hidden="true"><i className="bi bi-chevron-right"></i></span></button>
    </form>
  );
}
