import { isSupabaseAdminConfigured, supabaseAdmin } from "@/lib/supabase/server-admin";

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

function reportServerError(context: string, error: unknown) {
  console.error(`[Request Center email] ${context}`, error);
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function requestUrl(requestId: string) {
  const base = (
    process.env.NEXT_PUBLIC_SITE_URL || "https://admin.oakwellcabinetry.com"
  ).replace(/\/$/, "");
  return `${base}/requests?request=${encodeURIComponent(requestId)}`;
}

export async function POST(request: Request) {
  if (!isSupabaseAdminConfigured) {
    return jsonError("Server email delivery is not configured.", 503);
  }

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return jsonError("Authentication required.", 401);
  }

  const accessToken = authorization.slice("Bearer ".length).trim();
  const {
    data: { user },
    error: userError,
  } = await supabaseAdmin.auth.getUser(accessToken);

  if (userError || !user) {
    return jsonError("Invalid or expired session.", 401);
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id,is_active")
    .eq("id", user.id)
    .single();

  if (profileError || !profile?.is_active) {
    if (profileError) reportServerError("profile lookup failed", profileError);
    return jsonError("Active staff access is required.", 403);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonError("Invalid request body.", 400);
  }

  const requestId = typeof body.requestId === "string" ? body.requestId.trim() : "";
  if (!requestId) return jsonError("Request ID is required.", 400);

  const { data: supportRequest, error: requestError } = await supabaseAdmin
    .from("support_requests")
    .select(
      "id,requester_id,requester_name,requester_email,title,category,description,created_at"
    )
    .eq("id", requestId)
    .maybeSingle();

  if (requestError) {
    reportServerError("request lookup failed", requestError);
    return jsonError("Request details could not be loaded.", 500);
  }
  if (!supportRequest) return jsonError("Request was not found.", 404);
  if (supportRequest.requester_id !== user.id) {
    return jsonError("Only the requester can trigger the creation email.", 403);
  }

  const { data: deliveries, error: deliveryError } = await supabaseAdmin
    .from("support_request_email_deliveries")
    .select("id,recipient_email,status,attempts")
    .eq("request_id", requestId)
    .eq("event_type", "request_created");

  if (deliveryError) {
    reportServerError("delivery lookup failed", deliveryError);
    return jsonError("Request email delivery could not be loaded.", 500);
  }
  if (!deliveries?.length) {
    return jsonError("Request email delivery was not queued.", 409);
  }

  const unsentDeliveries = deliveries.filter(
    (delivery) => delivery.status !== "sent"
  );
  if (unsentDeliveries.length === 0) {
    return Response.json({
      success: true,
      status: "sent",
      alreadySent: true,
      sent: deliveries.length,
    });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return jsonError("Server email delivery is not configured.", 503);
  }

  const { data: settings, error: settingsError } = await supabaseAdmin
    .from("general_settings")
    .select("company_name,email,email_sender_name,email_sender_email,email_reply_to")
    .eq("id", 1)
    .single();

  if (settingsError || !settings) {
    if (settingsError) reportServerError("email settings lookup failed", settingsError);
    return jsonError("Email settings are unavailable.", 500);
  }

  const senderName = String(
    settings.email_sender_name || settings.company_name || "Modulex"
  ).trim();
  const senderEmail = String(
    settings.email_sender_email || "no-reply@auth.oakwellcabinetry.com"
  ).trim();
  const requester = String(
    supportRequest.requester_name ||
      supportRequest.requester_email ||
      "Modulex user"
  );
  const href = requestUrl(requestId);
  const html = `<!doctype html><html><body style="margin:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;color:#222"><div style="padding:40px 16px"><table role="presentation" width="100%"><tr><td align="center"><table role="presentation" width="100%" style="max-width:600px;background:#fff;border:1px solid #e5e5e5;border-radius:12px"><tr><td style="padding:32px 40px"><h1 style="margin:0 0 18px;font-size:24px">New Modulex request</h1><p style="font-size:15px;line-height:24px;color:#555">${escapeHtml(requester)} submitted a new request.</p><table role="presentation" width="100%" style="margin-top:20px;background:#fafafa;border-radius:8px"><tr><td style="padding:10px 16px;color:#777">Title</td><td style="padding:10px 16px;font-weight:600">${escapeHtml(supportRequest.title)}</td></tr><tr><td style="padding:10px 16px;color:#777">Category</td><td style="padding:10px 16px;font-weight:600">${escapeHtml(supportRequest.category)}</td></tr><tr><td style="padding:10px 16px;color:#777">Requester</td><td style="padding:10px 16px;font-weight:600">${escapeHtml(supportRequest.requester_email || requester)}</td></tr></table><p style="margin-top:20px;font-size:14px;line-height:22px;white-space:pre-wrap">${escapeHtml(supportRequest.description)}</p><p style="margin-top:24px"><a href="${escapeHtml(href)}" style="display:inline-block;padding:13px 22px;border-radius:8px;background:#111;color:#fff;text-decoration:none;font-weight:600">Open request</a></p></td></tr></table></td></tr></table></div></body></html>`;

  let sent = 0;
  let failed = 0;
  let processing = 0;

  for (const delivery of unsentDeliveries) {
    if (delivery.status === "processing") {
      processing += 1;
      continue;
    }

    const claimedAt = new Date().toISOString();
    const { data: claimed, error: claimError } = await supabaseAdmin
      .from("support_request_email_deliveries")
      .update({ status: "processing", updated_at: claimedAt })
      .eq("id", delivery.id)
      .in("status", ["pending", "failed"])
      .select("id,attempts")
      .maybeSingle();

    if (claimError) {
      reportServerError(`delivery claim failed (${delivery.id})`, claimError);
      failed += 1;
      continue;
    }
    if (!claimed) {
      processing += 1;
      continue;
    }

    const attempts = Number(claimed.attempts ?? 0) + 1;

    try {
      const resendResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `support-request-created:${requestId}:${delivery.recipient_email}`.slice(
            0,
            256
          ),
        },
        body: JSON.stringify({
          from: `${senderName} <${senderEmail}>`,
          to: [delivery.recipient_email],
          subject: `New request · ${supportRequest.title}`,
          html,
          ...(settings.email_reply_to || settings.email
            ? { reply_to: String(settings.email_reply_to || settings.email) }
            : {}),
        }),
      });

      const resendPayload = (await resendResponse.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      if (!resendResponse.ok) {
        throw new Error(
          typeof resendPayload.message === "string"
            ? resendPayload.message
            : `Resend returned HTTP ${resendResponse.status}.`
        );
      }

      const completedAt = new Date().toISOString();
      const { error: updateError } = await supabaseAdmin
        .from("support_request_email_deliveries")
        .update({
          status: "sent",
          attempts,
          resend_message_id:
            typeof resendPayload.id === "string" ? resendPayload.id : null,
          last_error: null,
          processed_at: completedAt,
          sent_at: completedAt,
          updated_at: completedAt,
        })
        .eq("id", delivery.id);

      if (updateError) throw updateError;
      sent += 1;
    } catch (errorValue) {
      reportServerError(`delivery failed (${delivery.id})`, errorValue);
      const internalMessage =
        errorValue instanceof Error
          ? errorValue.message
          : "Unknown request email delivery error.";
      const failedAt = new Date().toISOString();
      const nextAttemptAt = new Date(
        Date.now() + Math.min(60, Math.max(2, attempts * 5)) * 60_000
      ).toISOString();
      await supabaseAdmin
        .from("support_request_email_deliveries")
        .update({
          status: "failed",
          attempts,
          last_error: internalMessage,
          processed_at: failedAt,
          next_attempt_at: nextAttemptAt,
          updated_at: failedAt,
        })
        .eq("id", delivery.id);
      failed += 1;
    }
  }

  if (failed > 0) {
    return Response.json(
      {
        success: false,
        status: "partial_failure",
        sent,
        failed,
        processing,
        error: "Request email delivery could not be completed for all recipients.",
      },
      { status: 502 }
    );
  }

  if (sent === 0 && processing > 0) {
    return Response.json(
      { success: true, status: "processing", sent, processing },
      { status: 202 }
    );
  }

  return Response.json({ success: true, status: "sent", sent, processing });
}
