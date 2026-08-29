import { NextResponse } from "next/server";
import { Gc2dIntakeError, importGc2dRepresentativeCandidate } from "@/lib/store/gc2MediaIntake";

export const runtime = "nodejs";
export const maxDuration = 60;

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return null;
  const token = authorization.slice("Bearer ".length).trim();
  return token || null;
}

export async function POST(request: Request) {
  const accessToken = bearerToken(request);
  if (!accessToken) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  let payload: { candidate_id?: unknown };
  try {
    payload = (await request.json()) as { candidate_id?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (typeof payload.candidate_id !== "string" || !payload.candidate_id.trim()) {
    return NextResponse.json({ error: "A controlled candidate_id is required." }, { status: 400 });
  }

  try {
    const result = await importGc2dRepresentativeCandidate(accessToken, payload.candidate_id);
    return NextResponse.json({ result });
  } catch (error) {
    if (error instanceof Gc2dIntakeError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Controlled media intake failed", error);
    return NextResponse.json({ error: "Controlled media intake failed." }, { status: 500 });
  }
}
