import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guards";
import { getEbayAdapter } from "@/lib/platforms";

// GET /api/market/evaluate?q=&current_price=&target_margin= — PRÉ-FILTRE de
// rentabilité. Établit la cote (médiane des ventes conclues) et décide si le
// lot vaut le coup + jusqu'à combien. C'est ici que se branchera le code de
// médiane/estimation à venir ; l'analyse IA du contexte ne se déclenche que
// si worth_bidding est vrai.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (!q) return NextResponse.json({ error: { code: "missing_query", message: "?q= requis" } }, { status: 422 });

  const currentPrice = url.searchParams.get("current_price");
  const targetMargin = url.searchParams.get("target_margin");

  const evaluation = await getEbayAdapter().evaluate(
    q,
    currentPrice != null ? Number(currentPrice) : undefined,
    targetMargin != null ? Number(targetMargin) : undefined,
  );

  if (!evaluation) {
    return NextResponse.json(
      {
        error: {
          code: "market_unavailable",
          message:
            "Cote indisponible — vérifie que le service eBay tourne (ebay-service) et que l'accès Marketplace Insights est activé.",
        },
      },
      { status: 503 },
    );
  }

  return NextResponse.json(evaluation);
}
