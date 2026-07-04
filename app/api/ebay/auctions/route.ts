import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guards";
import { getAdapter } from "@/lib/platforms";

// GET /api/ebay/auctions?q= — enchères eBay ACTIVES pour une requête, mappées
// en LotEvent (via l'adapter réel → service Flask → Browse API). Renvoie une
// liste vide si eBay n'est pas configuré/joignable (dégradation propre).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (!q) return NextResponse.json({ error: { code: "missing_query", message: "?q= requis" } }, { status: 422 });

  const items = await getAdapter("ebay").searchListings(q);
  return NextResponse.json({ query: q, count: items.length, items });
}
