import "server-only";

import { supabaseAdmin } from "@/lib/supabase/server-admin";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function controlledActivationUrl(actionLink: string) {
  const source = new URL(actionLink);
  const tokenHash = source.searchParams.get("token");
  const type = source.searchParams.get("type");
  if (!tokenHash || type !== "recovery") {
    throw new Error("Generated dealer activation token is invalid.");
  }

  const storeBase = (
    process.env.NEXT_PUBLIC_STORE_URL ||
    process.env.STORE_SITE_URL ||
    "https://oakwell-phi.vercel.app"
  ).replace(/\/$/, "");
  const target = new URL(`${storeBase}/dealer/activate`);
  target.hash = new URLSearchParams({ token_hash: tokenHash, type: "recovery" }).toString();
  return target.toString();
}

async function senderSettings() {
  const { data, error } = await supabaseAdmin
    .from("general_settings")
    .select("company_name,email_sender_name,email_sender_email,email_reply_to")
    .eq("id", 1)
    .single();

  if (error || !data) throw new Error(error?.message || "Email sender settings are missing.");

  const companyName = String(data.company_name || "Oakwell Cabinetry");
  const senderName = String(data.email_sender_name || companyName).trim();
  const senderEmail = String(data.email_sender_email || "no-reply@auth.oakwellcabinetry.com").trim();
  const replyTo = data.email_reply_to ? String(data.email_reply_to).trim() : null;
  return { companyName, from: `${senderName} <${senderEmail}>`, replyTo };
}

export async function sendDealerPortalInvite(params: {
  to: string;
  fullName: string | null;
  customerName: string;
  activationUrl: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured.");

  const settings = await senderSettings();
  const activationUrl = controlledActivationUrl(params.activationUrl);
  const greeting = params.fullName?.trim() ? `Hello ${escapeHtml(params.fullName.trim())},` : "Hello,";
  const html = `<!doctype html><html><body style="margin:0;background:#f5f5f5;"><div style="padding:40px 16px;font-family:Arial,Helvetica,sans-serif;color:#222;"><table role="presentation" width="100%"><tr><td align="center"><table role="presentation" width="100%" style="max-width:600px;background:#fff;border:1px solid #e5e5e5;border-radius:12px;"><tr><td style="padding:36px 40px;"><h1 style="margin:0 0 20px;font-size:24px;color:#111;">Activate your dealer account</h1><p style="font-size:15px;line-height:24px;color:#555;">${greeting}</p><p style="font-size:15px;line-height:24px;color:#555;">${escapeHtml(params.customerName)} has been invited to the ${escapeHtml(settings.companyName)} Dealer Portal. Use the secure activation link below to choose your password and complete account activation.</p><table role="presentation" cellspacing="0" cellpadding="0" style="margin:24px 0;"><tr><td bgcolor="#111111" style="border-radius:8px;"><a href="${escapeHtml(activationUrl)}" style="display:inline-block;padding:13px 22px;font-size:14px;font-weight:600;color:#fff;text-decoration:none;">Activate dealer account</a></td></tr></table><p style="font-size:13px;line-height:20px;color:#777;">This activation link is temporary. If you were not expecting this invitation, you can ignore this email.</p></td></tr></table></td></tr></table></div></body></html>`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: settings.from,
      to: [params.to],
      reply_to: settings.replyTo || undefined,
      subject: `Activate your ${settings.companyName} dealer account`,
      html,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Dealer activation email failed (${response.status})${detail ? `: ${detail.slice(0, 300)}` : "."}`);
  }
}
