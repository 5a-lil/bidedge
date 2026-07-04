import { NextResponse } from "next/server";
import type { LotEvent } from "@/lib/contracts";
import { requireUser } from "@/lib/auth/guards";
import { edgeOf } from "@/lib/format";
import { getEbayAdapter } from "@/lib/platforms";

// GET /api/monitor?q=<type de produit>&margin=0.2 — monitore UN type de
// produit sur eBay : annonces actives + cote (médiane), avec pour chaque lot
// son écart à la cote et un drapeau « sous le marché » (pré-filtre). Une seule
// requête de cote par type (pas par lot) → l'edge de chaque lot est calculé
// localement.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type MonitorLot = LotEvent & { edgePct: number | null; belowMarket: boolean };

export async function GET(req: Request): Promise<Response> {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (!q) return NextResponse.json({ error: { code: "missing_query", message: "?q= requis" } }, { status: 422 });
  const marginRaw = Number(url.searchParams.get("margin"));
  const margin = Number.isFinite(marginRaw) && marginRaw > 0 && marginRaw < 1 ? marginRaw : 0.2;

  const adapter = getEbayAdapter();
  const [lots, evaluation] = await Promise.all([adapter.searchListings(q), adapter.evaluate(q)]);

  const median = evaluation?.median ?? null;
  const maxBid = median != null ? median * (1 - margin) : null;

  const enriched: MonitorLot[] = lots.map((lot) => ({
    ...lot,
    edgePct: median != null && median > 0 ? edgeOf(lot.currentBid, median) : null,
    belowMarket: maxBid != null ? lot.currentBid > 0 && lot.currentBid <= maxBid : false,
  }));

  return NextResponse.json({
    query: q,
    median,
    basis: evaluation?.basis ?? null, // "sold_90d" | "active_listings"
    sampleSize: evaluation?.sample_size ?? 0,
    reliableRange: evaluation?.reliable_range ?? null,
    low: evaluation?.low ?? null,
    high: evaluation?.high ?? null,
    maxProfitableBid: maxBid != null ? Math.round(maxBid) : null,
    count: enriched.length,
    lots: enriched,
  });
}
