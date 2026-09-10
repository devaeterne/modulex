import "server-only";

import { supabaseAdmin } from "@/lib/supabase/server-admin";

type EmailNotification = {
  id: string;
  event_type: string;
  audience: "customer" | "internal";
  entity_type: "order" | "invoice" | "customer" | "store_lead";
  entity_id: string;
  event_key: string;
  payload: Record<string, unknown>;
  status: "pending" | "failed" | "processing" | "sent" | "skipped";
  attempts: number;
  max_attempts: number;
};

type GeneralSettings = {
  company_name: string;
  logo_url: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  email_sender_name: string | null;
  email_sender_email: string | null;
  email_reply_to: string | null;
  order_notification_emails: string | null;
  lead_notification_emails: string | null;
  stock_notification_emails: string | null;
  pricing_notification_emails: string | null;
  invoice_notification_emails: string | null;
  send_customer_order_emails: boolean;
  send_customer_invoice_emails: boolean;
  notify_internal_new_order: boolean;
  notify_internal_order_status: boolean;
  notify_internal_stock_alerts: boolean;
  notify_internal_price_alerts: boolean;
  notify_internal_invoice_issued: boolean;
};

type ProcessingResult = {
  id: string;
  status: "sent" | "failed" | "skipped";
};

type DeliveryFailure = {
  code: string;
  reason: string;
};

const MAX_ATTEMPTS = 5;

class EmailDeliveryError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "EmailDeliveryError";
    this.code = code;
  }
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function money(value: unknown, currency = "USD") {
  const amount = Number(value ?? 0);
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
      Number.isFinite(amount) ? amount : 0
    );
  } catch {
    return `$${(Number.isFinite(amount) ? amount : 0).toFixed(2)}`;
  }
}

function titleCase(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://admin.oakwellcabinetry.com").replace(/\/$/, "");
}

function adminOrderUrl(customerId: string, orderId: string) {
  return `${siteUrl()}/customers/${customerId}/orders/${orderId}`;
}

function adminInvoiceUrl(customerId: string, invoiceId: string) {
  return `${siteUrl()}/customers/${customerId}/invoices/${invoiceId}`;
}

function adminStoreLeadUrl(leadId: string) {
  return `${siteUrl()}/store/leads/${leadId}`;
}

function adminApprovalsUrl() {
  return `${siteUrl()}/approvals`;
}

function shell(settings: GeneralSettings, title: string, body: string, footer = "Automated notification") {
  const logo = settings.logo_url
    ? `<img src="${escapeHtml(settings.logo_url)}" alt="${escapeHtml(settings.company_name)}" width="180" style="display:block;max-width:180px;max-height:64px;height:auto;border:0;object-fit:contain;" />`
    : `<div style="font-size:22px;font-weight:700;color:#111111;">${escapeHtml(settings.company_name)}</div>`;

  return `<!doctype html><html><body style="margin:0;background:#f5f5f5;"><div style="margin:0;padding:40px 16px;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;color:#222222;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background:#ffffff;border:1px solid #e5e5e5;border-radius:12px;"><tr><td style="padding:32px 40px 24px;">${logo}</td></tr><tr><td style="padding:0 40px 40px;"><h1 style="margin:0 0 18px;font-size:24px;line-height:32px;color:#111111;">${escapeHtml(title)}</h1>${body}</td></tr></table><p style="margin:20px 0 0;font-size:12px;line-height:18px;color:#999999;">© ${escapeHtml(settings.company_name)} · ${escapeHtml(footer)}</p></td></tr></table></div></body></html>`;
}

function button(label: string, url: string) {
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:24px;"><tr><td bgcolor="#111111" style="border-radius:8px;"><a href="${escapeHtml(url)}" style="display:inline-block;padding:13px 22px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">${escapeHtml(label)}</a></td></tr></table>`;
}

function paragraph(value: string) {
  return `<p style="margin:0 0 16px;font-size:15px;line-height:24px;color:#555555;">${value}</p>`;
}

function detailRows(rows: Array<[string, string]>) {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:20px;background:#fafafa;border-radius:8px;">${rows.map(([label, value]) => `<tr><td style="padding:10px 16px;font-size:13px;color:#777777;border-bottom:1px solid #eeeeee;">${escapeHtml(label)}</td><td align="right" style="padding:10px 16px;font-size:14px;font-weight:600;color:#222222;border-bottom:1px solid #eeeeee;">${escapeHtml(value)}</td></tr>`).join("")}</table>`;
}

async function loadSettings() {
  const { data, error } = await supabaseAdmin.from("general_settings").select("*").eq("id", 1).single();
  if (error || !data) throw new EmailDeliveryError("settings_unavailable", "Email settings are unavailable.");
  return data as GeneralSettings;
}

async function customerRecipients(customerId: string, type: "order" | "invoice"): Promise<string[]> {
  const flag = type === "order" ? "is_order_contact" : "is_billing_contact";
  const { data: preferred } = await supabaseAdmin
    .from("customer_contacts")
    .select("email")
    .eq("customer_id", customerId)
    .eq("is_active", true)
    .eq(flag, true)
    .not("email", "is", null);

  let emails = (preferred ?? []).map((row) => String(row.email || "").trim().toLowerCase()).filter(Boolean);

  if (!emails.length) {
    const { data: primary } = await supabaseAdmin
      .from("customer_contacts")
      .select("email")
      .eq("customer_id", customerId)
      .eq("is_active", true)
      .eq("is_primary", true)
      .not("email", "is", null);
    emails = (primary ?? []).map((row) => String(row.email || "").trim().toLowerCase()).filter(Boolean);
  }

  if (!emails.length) {
    const { data: customer } = await supabaseAdmin.from("customers").select("email").eq("id", customerId).single();
    if (customer?.email) emails = [String(customer.email).trim().toLowerCase()];
  }

  return Array.from(new Set<string>(emails.filter((email) => email.includes("@"))));
}

function payloadUuid(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  if (typeof value !== "string") return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

async function internalRecipients(notification: EmailNotification): Promise<string[]> {
  const { data, error } = await supabaseAdmin.rpc("resolve_notification_delivery_recipients", {
    p_event_type: notification.event_type,
    p_originator_id: payloadUuid(notification.payload ?? {}, "requested_by"),
  });

  if (error) throw new EmailDeliveryError("recipient_resolution_failed", "Notification recipients could not be resolved.");

  const emails = (data ?? []).map((row: { email?: string; recipient_scope?: string; required_permissions?: string[] }) => {
    void row.recipient_scope;
    void row.required_permissions;
    return String(row.email || "").trim().toLowerCase();
  }).filter((email: string) => email.includes("@"));

  return Array.from(new Set<string>(emails));
}

async function isEnabled(settings: GeneralSettings, notification: EmailNotification) {
  if (notification.audience === "customer") {
    return notification.entity_type === "invoice"
      ? settings.send_customer_invoice_emails
      : settings.send_customer_order_emails;
  }

  const { data: rule } = await supabaseAdmin
    .from("notification_delivery_rules")
    .select("internal_email_enabled,recipient_scope,required_permissions")
    .eq("event_type", notification.event_type)
    .maybeSingle();
  if (rule) {
    void rule.recipient_scope;
    void rule.required_permissions;
    return Boolean(rule.internal_email_enabled);
  }

  if (notification.event_type === "new_order") return settings.notify_internal_new_order;
  if (notification.event_type === "order_status_changed") return settings.notify_internal_order_status;
  if (notification.event_type === "stock_review_required") return settings.notify_internal_stock_alerts;
  if (notification.event_type === "price_review_required") return settings.notify_internal_price_alerts;
  if (notification.event_type === "invoice_issued") return settings.notify_internal_invoice_issued;
  return true;
}

async function renderApproval(notification: EmailNotification, settings: GeneralSettings) {
  const payload = notification.payload ?? {};
  const entityLabel = String(payload.entity_label || titleCase(notification.entity_type));
  const requestType = titleCase(String(payload.request_type || "approval_request"));
  const requestReason = String(payload.request_reason || "A protected action requires review.");
  const decision = notification.event_type === "approval_approved"
    ? "Approved"
    : notification.event_type === "approval_rejected"
      ? "Rejected"
      : "Pending Review";
  const riskSummary = payload.risk_summary && typeof payload.risk_summary === "object"
    ? payload.risk_summary as Record<string, unknown>
    : {};
  const reasons = Array.isArray(riskSummary.reasons)
    ? riskSummary.reasons as Array<Record<string, unknown>>
    : [];
  const reasonsHtml = reasons.length
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:20px;">${reasons.map((reason) => `<tr><td style="padding:10px 12px;border-bottom:1px solid #eeeeee;font-size:13px;color:#444444;">${escapeHtml(reason.label || titleCase(String(reason.type || "exception")))}${reason.sku ? ` · ${escapeHtml(reason.sku)}` : ""}</td></tr>`).join("")}</table>`
    : "";

  const title = notification.event_type === "approval_requested"
    ? `Approval required – ${entityLabel}`
    : `Approval ${decision.toLowerCase()} – ${entityLabel}`;
  const html = shell(
    settings,
    title,
    `${paragraph(escapeHtml(requestReason))}${detailRows([["Record", entityLabel], ["Request", requestType], ["Status", decision]])}${reasonsHtml}${button(notification.event_type === "approval_requested" ? "Review approval" : "Open approvals", adminApprovalsUrl())}`,
    "Internal approval notification"
  );
  return { customerId: "", subject: title, html };
}

async function renderStoreLead(notification: EmailNotification, settings: GeneralSettings) {
  const { data: lead, error } = await supabaseAdmin
    .from("store_leads")
    .select("id,reference_code,lead_type,first_name,last_name,email,phone,company_name,country_code,city,business_type,created_at")
    .eq("id", notification.entity_id)
    .single();

  if (error || !lead) throw new EmailDeliveryError("render_entity_missing", "Store lead data is unavailable for this notification.");

  const isDealer = lead.lead_type === "dealer_application";
  const leadLabel = isDealer ? "Dealer application" : "Website inquiry";
  const contactName = [lead.first_name, lead.last_name].map((value) => String(value || "").trim()).filter(Boolean).join(" ") || "—";
  const location = [lead.city, lead.country_code].map((value) => String(value || "").trim()).filter(Boolean).join(", ") || "—";
  const title = `${leadLabel} – ${lead.reference_code}`;
  const rows: Array<[string, string]> = [
    ["Reference", lead.reference_code],
    ["Type", leadLabel],
    ["Contact", contactName],
    ["Company", lead.company_name || "—"],
    ["Email", lead.email || "—"],
    ["Phone", lead.phone || "—"],
    ["Location", location],
  ];
  if (isDealer && lead.business_type) rows.push(["Business type", titleCase(String(lead.business_type))]);

  const html = shell(
    settings,
    title,
    `${paragraph(`A new <strong>${escapeHtml(leadLabel.toLowerCase())}</strong> was submitted through the Oakwell Store.`)}${detailRows(rows)}${button("Open Store lead", adminStoreLeadUrl(lead.id))}`,
    "Internal Store lead notification"
  );

  return { customerId: "", subject: `${title}${lead.company_name ? ` · ${lead.company_name}` : ""}`, html };
}

async function renderOrder(notification: EmailNotification, settings: GeneralSettings) {
  const [{ data: order, error: orderError }, { data: items }] = await Promise.all([
    supabaseAdmin.from("customer_orders").select("*").eq("id", notification.entity_id).single(),
    supabaseAdmin.from("customer_order_items").select("sku_snapshot, product_name_snapshot, quantity, unit_price, line_total").eq("order_id", notification.entity_id).order("line_no"),
  ]);
  if (orderError || !order) throw new EmailDeliveryError("render_entity_missing", "Order data is unavailable for this notification.");

  const { data: customer } = await supabaseAdmin.from("customers").select("id, name, customer_code, email").eq("id", order.customer_id).single();
  if (!customer) throw new EmailDeliveryError("render_entity_missing", "Customer data is unavailable for this notification.");

  const total = Number(order.grand_total ?? 0) > 0 || Number(order.total_amount ?? 0) === 0 ? Number(order.grand_total ?? 0) : Number(order.total_amount ?? 0);
  const summary = detailRows([
    ["Order", order.order_number],
    ["Customer", customer.name],
    ["Items", String(order.item_count ?? items?.length ?? 0)],
    ["Total", money(total, order.currency_code)],
    ["Status", titleCase(order.status)],
  ]);

  if (notification.event_type === "stock_review_required") {
    const issues = Array.isArray(notification.payload.issues) ? notification.payload.issues as Array<Record<string, unknown>> : [];
    const rows = issues.map((issue) => `<tr><td style="padding:10px;border-bottom:1px solid #eee;font-size:13px;"><strong>${escapeHtml(issue.sku)}</strong><br><span style="color:#777">${escapeHtml(issue.product_name)}</span></td><td align="right" style="padding:10px;border-bottom:1px solid #eee;font-size:13px;">Requested: ${escapeHtml(issue.requested_quantity)}<br>Available: ${escapeHtml(issue.available_quantity)}<br><strong>Short: ${escapeHtml(issue.shortage_quantity)}</strong></td></tr>`).join("");
    const html = shell(settings, `Stock review required – ${order.order_number}`, `${paragraph(`One or more products on <strong>${escapeHtml(order.order_number)}</strong> do not have enough currently available sellable stock.`)}${summary}<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:20px;">${rows}</table>${button("Review order", adminOrderUrl(customer.id, order.id))}`, "Internal stock notification");
    return { customerId: customer.id, subject: `Stock review required – ${order.order_number}`, html };
  }

  if (notification.event_type === "price_review_required") {
    const issues = Array.isArray(notification.payload.issues) ? notification.payload.issues as Array<Record<string, unknown>> : [];
    const rows = issues.map((issue) => `<tr><td style="padding:10px;border-bottom:1px solid #eee;font-size:13px;"><strong>${escapeHtml(issue.sku)}</strong><br><span style="color:#777">${escapeHtml(issue.product_name)}</span></td><td align="right" style="padding:10px;border-bottom:1px solid #eee;font-size:13px;">Order: ${escapeHtml(money(issue.order_price, order.currency_code))}<br>Current: ${issue.expected_price == null ? "Missing" : escapeHtml(money(issue.expected_price, order.currency_code))}<br><strong>${escapeHtml(titleCase(String(issue.reason || "review_required")))}</strong></td></tr>`).join("");
    const html = shell(settings, `Price review required – ${order.order_number}`, `${paragraph(`Pricing on <strong>${escapeHtml(order.order_number)}</strong> requires review before further processing.`)}${summary}<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:20px;">${rows}</table>${button("Review order", adminOrderUrl(customer.id, order.id))}`, "Internal pricing notification");
    return { customerId: customer.id, subject: `Price review required – ${order.order_number}`, html };
  }

  if (notification.audience === "internal" && notification.event_type === "new_order") {
    const html = shell(settings, `New order – ${order.order_number}`, `${paragraph(`<strong>${escapeHtml(customer.name)}</strong> has a new order in the system.`)}${summary}${button("Open order", adminOrderUrl(customer.id, order.id))}`, "Internal order notification");
    return { customerId: customer.id, subject: `New order – ${order.order_number} · ${customer.name}`, html };
  }

  if (notification.audience === "internal") {
    const from = titleCase(String(notification.payload.from_status || ""));
    const to = titleCase(String(notification.payload.to_status || order.status));
    const html = shell(settings, `Order status updated – ${order.order_number}`, `${paragraph(`${escapeHtml(from)} → <strong>${escapeHtml(to)}</strong>`)}${summary}${button("Open order", adminOrderUrl(customer.id, order.id))}`, "Internal order notification");
    return { customerId: customer.id, subject: `Order status updated – ${order.order_number}: ${to}`, html };
  }

  if (notification.event_type === "order_received") {
    const html = shell(settings, "We received your order", `${paragraph(`Thank you. We received your order <strong>${escapeHtml(order.order_number)}</strong> and it is currently being reviewed.`)}${detailRows([["Order", order.order_number], ["Total", money(total, order.currency_code)]])}${paragraph("We will notify you when there is an update to your order.")}`, "Order notification");
    return { customerId: customer.id, subject: `We received your order – ${order.order_number}`, html };
  }

  if (notification.event_type === "order_confirmed") {
    const html = shell(settings, "Your order is confirmed", `${paragraph(`Your order <strong>${escapeHtml(order.order_number)}</strong> has been confirmed by ${escapeHtml(settings.company_name)}.`)}${detailRows([["Order", order.order_number], ["Total", money(total, order.currency_code)], ["Status", "Confirmed"]])}${paragraph("We will keep you updated as your order progresses.")}`, "Order confirmation");
    return { customerId: customer.id, subject: `Order confirmed – ${order.order_number}`, html };
  }

  const toStatus = titleCase(String(notification.payload.to_status || order.status));
  const note = notification.payload.note ? paragraph(`<strong>Note:</strong> ${escapeHtml(notification.payload.note)}`) : "";
  const html = shell(settings, `Order update: ${toStatus}`, `${paragraph(`There is an update to your order <strong>${escapeHtml(order.order_number)}</strong>.`)}${detailRows([["Order", order.order_number], ["Status", toStatus], ["Total", money(total, order.currency_code)]])}${note}`, "Order status notification");
  return { customerId: customer.id, subject: `Order update – ${order.order_number}: ${toStatus}`, html };
}

async function renderInvoice(notification: EmailNotification, settings: GeneralSettings) {
  const { data: invoice, error } = await supabaseAdmin.from("customer_invoices").select("*").eq("id", notification.entity_id).single();
  if (error || !invoice) throw new EmailDeliveryError("render_entity_missing", "Invoice data is unavailable for this notification.");
  const { data: customer } = await supabaseAdmin.from("customers").select("id, name, customer_code, email").eq("id", invoice.customer_id).single();
  if (!customer) throw new EmailDeliveryError("render_entity_missing", "Customer data is unavailable for this notification.");

  const summary = detailRows([
    ["Invoice", invoice.invoice_number],
    ["Customer", customer.name],
    ["Invoice date", invoice.invoice_date || "—"],
    ["Due date", invoice.due_date || "—"],
    ["Total", money(invoice.total_amount, invoice.currency_code)],
  ]);

  if (notification.audience === "internal") {
    return {
      customerId: customer.id,
      subject: `Invoice issued – ${invoice.invoice_number}`,
      html: shell(settings, `Invoice issued – ${invoice.invoice_number}`, `${paragraph(`Invoice <strong>${escapeHtml(invoice.invoice_number)}</strong> was issued for ${escapeHtml(customer.name)}.`)}${summary}${button("Open invoice", adminInvoiceUrl(customer.id, invoice.id))}`, "Internal invoice notification"),
    };
  }

  return {
    customerId: customer.id,
    subject: `Invoice ${invoice.invoice_number} from ${settings.company_name}`,
    html: shell(settings, `Invoice ${invoice.invoice_number}`, `${paragraph(`Your invoice from <strong>${escapeHtml(settings.company_name)}</strong> is now available.`)}${summary}${paragraph("Please contact us if you have any questions about this invoice.")}`, "Invoice notification"),
  };
}

function providerFailure(status: number) {
  if (status === 429) return new EmailDeliveryError("provider_rate_limited", "Email provider rate limited the request.");
  if (status === 401 || status === 403) return new EmailDeliveryError("provider_auth_failed", "Email provider authentication failed.");
  if (status === 400 || status === 422) return new EmailDeliveryError("provider_rejected", "Email provider rejected the message.");
  if (status >= 500) return new EmailDeliveryError("provider_unavailable", "Email provider is temporarily unavailable.");
  return new EmailDeliveryError("provider_error", "Email provider could not deliver the message.");
}

async function sendWithResend(params: { from: string; to: string; replyTo?: string | null; subject: string; html: string; idempotencyKey: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new EmailDeliveryError("provider_not_configured", "Email provider is not configured.");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": params.idempotencyKey,
    },
    body: JSON.stringify({
      from: params.from,
      to: [params.to],
      subject: params.subject,
      html: params.html,
      ...(params.replyTo ? { reply_to: params.replyTo } : {}),
    }),
  });

  if (!response.ok) throw providerFailure(response.status);
  const payload = await response.json().catch(() => ({}));
  return String(payload?.id || "");
}

function normalizeDeliveryFailure(errorValue: unknown): DeliveryFailure {
  if (errorValue instanceof EmailDeliveryError) {
    return { code: errorValue.code, reason: errorValue.message };
  }
  return { code: "delivery_failed", reason: "Email delivery failed before completion." };
}

async function processOne(notification: EmailNotification, settings: GeneralSettings): Promise<ProcessingResult> {
  if (!(await isEnabled(settings, notification))) {
    await supabaseAdmin.from("email_notifications").update({
      status: "skipped",
      processing_started_at: null,
      failure_code: "delivery_disabled",
      processed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_error: "Notification email is disabled by the delivery rule.",
    }).eq("id", notification.id);
    return { id: notification.id, status: "skipped" };
  }

  const rendered = notification.event_type.startsWith("approval_")
    ? await renderApproval(notification, settings)
    : notification.entity_type === "order"
      ? await renderOrder(notification, settings)
      : notification.entity_type === "invoice"
        ? await renderInvoice(notification, settings)
        : notification.entity_type === "store_lead"
          ? await renderStoreLead(notification, settings)
          : (() => { throw new EmailDeliveryError("unsupported_entity", "Notification entity type is unsupported."); })();

  const recipients: string[] = notification.audience === "customer"
    ? await customerRecipients(rendered.customerId, notification.entity_type === "invoice" ? "invoice" : "order")
    : await internalRecipients(notification);

  if (!recipients.length) {
    await supabaseAdmin.from("email_notifications").update({
      status: "skipped",
      processing_started_at: null,
      failure_code: "no_eligible_recipient",
      processed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_error: "No eligible recipient is configured for this notification.",
    }).eq("id", notification.id);
    return { id: notification.id, status: "skipped" };
  }

  const senderName = settings.email_sender_name?.trim() || settings.company_name;
  const senderEmail = settings.email_sender_email?.trim() || "no-reply@auth.oakwellcabinetry.com";
  const from = `${senderName} <${senderEmail}>`;
  const messageIds: string[] = [];

  for (const recipient of recipients) {
    const id = await sendWithResend({
      from,
      to: recipient,
      replyTo: settings.email_reply_to || settings.email,
      subject: rendered.subject,
      html: rendered.html,
      idempotencyKey: `${notification.event_key}:${recipient}`.slice(0, 256),
    });
    if (id) messageIds.push(id);
  }

  const now = new Date().toISOString();
  await supabaseAdmin.from("email_notifications").update({
    status: "sent",
    processing_started_at: null,
    failure_code: null,
    to_emails: recipients,
    resend_message_ids: messageIds,
    last_error: null,
    sent_at: now,
    processed_at: now,
    updated_at: now,
  }).eq("id", notification.id);

  return { id: notification.id, status: "sent" };
}

export function summarizeEmailProcessingResults(results: ProcessingResult[]) {
  return results.reduce(
    (summary, result) => {
      summary.processed += 1;
      summary[result.status] += 1;
      return summary;
    },
    { processed: 0, sent: 0, failed: 0, skipped: 0 }
  );
}

export async function processPendingEmailNotifications(limit = 20) {
  const settings = await loadSettings();
  const now = new Date().toISOString();

  await supabaseAdmin.rpc("recover_stuck_email_notifications");

  const { data, error } = await supabaseAdmin
    .from("email_notifications")
    .select("id,event_type,audience,entity_type,entity_id,event_key,payload,status,attempts,max_attempts")
    .in("status", ["pending", "failed"])
    .lt("attempts", MAX_ATTEMPTS)
    .lte("next_attempt_at", now)
    .order("created_at", { ascending: true })
    .limit(Math.min(Math.max(limit, 1), 50));

  if (error) throw new EmailDeliveryError("queue_read_failed", "Email queue could not be read.");

  const results: ProcessingResult[] = [];

  for (const candidate of (data ?? []) as EmailNotification[]) {
    if (candidate.attempts >= candidate.max_attempts) continue;

    const claimedAttempts = candidate.attempts + 1;
    const claimTime = new Date().toISOString();
    const { data: claimed } = await supabaseAdmin
      .from("email_notifications")
      .update({
        status: "processing",
        attempts: claimedAttempts,
        processing_started_at: claimTime,
        updated_at: claimTime,
      })
      .eq("id", candidate.id)
      .eq("status", candidate.status)
      .eq("attempts", candidate.attempts)
      .select("id")
      .maybeSingle();

    if (!claimed) continue;

    try {
      results.push(await processOne({ ...candidate, attempts: claimedAttempts, status: "processing" }, settings));
    } catch (errorValue) {
      const failure = normalizeDeliveryFailure(errorValue);
      const retryMinutes = Math.min(60, Math.max(2, claimedAttempts * 5));
      const nextAttempt = new Date(Date.now() + retryMinutes * 60_000).toISOString();
      await supabaseAdmin.from("email_notifications").update({
        status: "failed",
        processing_started_at: null,
        failure_code: failure.code,
        last_error: failure.reason,
        next_attempt_at: nextAttempt,
        processed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", candidate.id);
      results.push({ id: candidate.id, status: "failed" });
    }
  }

  return results;
}