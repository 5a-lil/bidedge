import "server-only";
import type { LotEvent } from "@/lib/contracts";
import { edgeOf } from "@/lib/format";
import { getEbayAdapter } from "@/lib/platforms";
import type { PlanSummary } from "@/lib/platforms/ebay";

// Logique de monitoring d'un type de produit — partagée par la route REST
// (/api/monitor) et le flux SSE (/api/monitor/stream). Une seule requête de
// cote par type ; l'edge de chaque lot est calculé localement.

export type MonitorLot = LotEvent & { edgePct: number | null; belowMarket: boolean };

export type MonitorPayload = {
  query: string;
  median: number | null;
  basis: "sold_90d" | "active_listings" | null;
  dominantCategory: string | null;
  plan: PlanSummary | null;
  sampleSize: number;
  reliableRange: [number, number] | null;
  low: number | null;
  high: number | null;
  maxProfitableBid: number | null;
  maxHours: number;
  count: number;
  lots: MonitorLot[];
};

export async function getMonitorData(q: string, margin = 0.2, maxHours = 24): Promise<MonitorPayload> {
  const adapter = getEbayAdapter();
  const [search, evaluation] = await Promise.all([adapter.searchAuctions(q, maxHours), adapter.evaluate(q)]);

  const median = evaluation?.median ?? null;
  const maxBid = median != null ? median * (1 - margin) : null;

  const lots: MonitorLot[] = search.items.map((lot) => ({
    ...lot,
    edgePct: median != null && median > 0 ? edgeOf(lot.currentBid, median) : null,
    belowMarket: maxBid != null ? lot.currentBid > 0 && lot.currentBid <= maxBid : false,
  }));

  return {
    query: q,
    median,
    basis: (evaluation?.basis as MonitorPayload["basis"]) ?? null,
    dominantCategory: search.dominantCategory ?? evaluation?.dominantCategory ?? null,
    plan: search.plan ?? evaluation?.plan ?? null,
    sampleSize: evaluation?.sample_size ?? 0,
    reliableRange: (evaluation?.reliable_range as [number, number] | undefined) ?? null,
    low: evaluation?.low ?? null,
    high: evaluation?.high ?? null,
    maxProfitableBid: maxBid != null ? Math.round(maxBid) : null,
    maxHours,
    count: lots.length,
    lots,
  };
}

export function parseMonitorParams(url: URL): { margin: number; maxHours: number } {
  const marginRaw = Number(url.searchParams.get("margin"));
  const margin = Number.isFinite(marginRaw) && marginRaw > 0 && marginRaw < 1 ? marginRaw : 0.2;
  const hoursRaw = Number(url.searchParams.get("max_hours"));
  const maxHours = Number.isFinite(hoursRaw) && hoursRaw >= 0 ? hoursRaw : 24;
  return { margin, maxHours };
}
