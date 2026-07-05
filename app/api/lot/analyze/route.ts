import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guards";
import { getEbayAdapter } from "@/lib/platforms";

// GET /api/lot/analyze?itemId=&median= — verdict IA du CONTEXTE d'un lot
// (état réel, red flags, prix max conseillé). Pré-filtre respecté : l'UI ne
// demande l'analyse que pour les lots déjà sous la cote (worth_bidding).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const itemId = (url.searchParams.get("itemId") ?? "").trim();
  if (!itemId) {
    return NextResponse.json({ error: { code: "missing_item", message: "?itemId= requis" } }, { status: 422 });
  }
  const medianRaw = Number(url.searchParams.get("median"));
  const median = Number.isFinite(medianRaw) && medianRaw > 0 ? medianRaw : null;

  const verdict = await getEbayAdapter().analyzeLot(itemId, median);
  if (!verdict) {
    return NextResponse.json(
      { error: { code: "analysis_unavailable", message: "Analyse indisponible — vérifie la clé Gemini et le service eBay" } },
      { status: 503 },
    );
  }
  return NextResponse.json({ itemId, verdict });
}
