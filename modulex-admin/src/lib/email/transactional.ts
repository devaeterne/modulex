import "server-only";

import { supabaseAdmin } from "@/lib/supabase/server-admin";

type EmailNotification = {
  id: string;
  event_type: string;
  audience: "customer" | "internal";
  entity_type: "order" | "invoice";
  entity_id: string;
  event_key: string;
  payload: Record<string, unknown>;
  status: "pending" | "failed" | "processing" | "sent" | "skipped";
  attempts: number;
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

const MAX_ATTEMPTS = 5;

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

function parseEmails(value: string | null | undefined) {
  if (!value) return [];
  return [...new Set(value.split(/[;,\n]/).map((item) => item.trim().toLowerCase()).filter((item) => item.includes("@")))];
}

function adminOrderUrl(customerId: string, orderId: string) {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://admin.oakwellcabinetry.com").replace(/\/$/, "");
  return `${siteUrl}/customers/${customerId}/orders/${orderId}`;
}

function adminInvoiceUrl(customerId: string, invoiceId: string) {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://admin.oakwellcabinetry.com").replace(/\/$/, "");
  return `${siteUrl}/customers/${customerId}/invoices/${invoiceId}`;
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
  if (error || !data) throw new Error(error?.message || "General settings are missing.");
  return data as GeneralSettings;
}

async function customerRecipients(customerId: string, type: "order" | "invoice") {
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

  return [...new Set(emails.filter((email) => email.includes("@")))];
}

function internalRecipients(settings: GeneralSettings, eventType: string) {
  let configured: string | null = null;
  if (eventType === "stock_review_required") configured = settings.stock_notification_emails;
  else if (eventType === "price_review_required") configured = settings.pricing_notification_emails;
  else if (eventType === "invoice_issued") configured = settings.invoice_notification_emails;
  else configured = settings.order_notification_emails;

  const emails = parseEmails(configured);
  if (!emails.length && settings.email) emails.push(...parseEmails(settings.email));
  return [...new Set(emails)];
}

function isEnabled(settings: GeneralSettings, notification: EmailNotification) {
  if (notification.audience === "customer") {
    return notification.entity_type === "invoice"
      ? settings.send_customer_invoice_emails
      : settings.send_customer_order_emails;
  }
  if (notification.event_type === "new_order") return settings.notify_internal_new_order;
  if (notification.event_type === "order_status_changed") return settings.notify_internal_order_status;
  if (notification.event_type === "stock_review_required") return settings.notify_internal_stock_alerts;
  if (notification.event_type === "price_review_required") return settings.notify_internal_price_alerts;
  if (notification.event_type === "invoice_issued") return settings.notify_internal_invoice_issued;
  return true;
}

async function renderOrder(notification: EmailNotification, settings: GeneralSettings) {
  const [{ data: order, error: orderError }, { data: items }] = await Promise.all([
    supabaseAdmin.from("customer_orders").select("*").eq("id", notification.entity_id).single(),
    supabaseAdmin.from("customer_order_items").select("sku_snapshot, product_name_snapshot, quantity, unit_price, line_total").eq("order_id", notification.entity_id).order("line_no"),
  ]);
  if (orderError || !order) throw new Error(orderError?.message || "Order was not found.");

  const { data: customer } = await supabaseAdmin.from("customers").select("id, name, customer_code, email").eq("id", order.customer_id).single();
  if (!customer) throw new Error("Order customer was not found.");

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
  if (error || !invoice) throw new Error(error?.message || "Invoice was not found.");
  const { data: customer } = await supabaseAdmin.from("customers").select("id, name, customer_code, email").eq("id", invoice.customer_id).single();
  if (!customer) throw new Error("Invoice customer was not found.");

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

async function sendWithResend(params: { from: string; to: string; replyTo?: string | null; subject: string; html: string; idempotencyKey: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured.");

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

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.message || `Resend returned HTTP ${response.status}.`);
  return String(payload?.id || "");
}

async function processOne(notification: EmailNotification, settings: GeneralSettings) {
  if (!isEnabled(settings, notification)) {
    await supabaseAdmin.from("email_notifications").update({ status: "skipped", processed_at: new Date().toISOString(), updated_at: new Date().toISOString(), last_error: "Notification is disabled in General Settings." }).eq("id", notification.id);
    return { id: notification.id, status: "skipped" as const };
  }

  const rendered = notification.entity_type === "order"
    ? await renderOrder(notification, settings)
    : await renderInvoice(notification, settings);

  const recipients = notification.audience === "customer"
    ? await customerRecipients(rendered.customerId, notification.entity_type)
    : internalRecipients(settings, notification.event_type);

  if (!recipients.length) {
    await supabaseAdmin.from("email_notifications").update({ status: "skipped", processed_at: new Date().toISOString(), updated_at: new Date().toISOString(), last_error: "No recipient email is configured." }).eq("id", notification.id);
    return { id: notification.id, status: "skipped" as const };
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
    attempts: notification.attempts + 1,
    to_emails: recipients,
    resend_message_ids: messageIds,
    last_error: null,
    sent_at: now,
    processed_at: now,
    updated_at: now,
  }).eq("id", notification.id);

  return { id: notification.id, status: "sent" as const, recipients };
}

export async function processPendingEmailNotifications(limit = 20) {
  const settings = await loadSettings();
  const now = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("email_notifications")
    .select("id,event_type,audience,entity_type,entity_id,event_key,payload,status,attempts")
    .in("status", ["pending", "failed"])
    .lt("attempts", MAX_ATTEMPTS)
    .lte("next_attempt_at", now)
    .order("created_at", { ascending: true })
    .limit(Math.min(Math.max(limit, 1), 50));

  if (error) throw new Error(error.message);

  const results: Array<Record<string, unknown>> = [];

  for (const candidate of (data ?? []) as EmailNotification[]) {
    const { data: claimed } = await supabaseAdmin
      .from("email_notifications")
      .update({ status: "processing", updated_at: new Date().toISOString() })
      .eq("id", candidate.id)
      .eq("status", candidate.status)
      .select("id")
      .maybeSingle();

    if (!claimed) continue;

    try {
      results.push(await processOne({ ...candidate, status: "processing" }, settings));
    } catch (errorValue) {
      const attempts = candidate.attempts + 1;
      const retryMinutes = Math.min(60, Math.max(2, attempts * 5));
      const nextAttempt = new Date(Date.now() + retryMinutes * 60_000).toISOString();
      const message = errorValue instanceof Error ? errorValue.message : "Unknown email delivery error.";
      await supabaseAdmin.from("email_notifications").update({
        status: "failed",
        attempts,
        last_error: message,
        next_attempt_at: nextAttempt,
        processed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", candidate.id);
      results.push({ id: candidate.id, status: "failed", error: message });
    }
  }

  return results;
}
