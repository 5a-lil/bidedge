import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guards";
import { getMonitorData, parseMonitorParams } from "@/lib/monitor";

// GET /api/monitor?q=<type de produit>&margin=0.2&max_hours=24 — monitore UN
// type de produit sur eBay : enchères actives (fenêtre de clôture max_hours,
// filtre Gemini) + cote (médiane) + edge et « sous le marché » par lot.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (!q) return NextResponse.json({ error: { code: "missing_query", message: "?q= requis" } }, { status: 422 });
  const { margin, maxHours } = parseMonitorParams(url);

  return NextResponse.json(await getMonitorData(q, margin, maxHours));
}
