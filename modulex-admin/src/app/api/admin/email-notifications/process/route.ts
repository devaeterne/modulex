import { jsonError, requireAdmin } from "@/lib/auth/admin-api";
import { processPendingEmailNotifications } from "@/lib/email/transactional";

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    // Empty body is allowed.
  }

  const limit = Math.min(50, Math.max(1, Number(body.limit || 20) || 20));

  try {
    const results = await processPendingEmailNotifications(limit);
    return Response.json({ success: true, processed: results.length, results });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Email notifications could not be processed.", 500);
  }
}
