import type { LotEvent } from "@/lib/contracts";
import type { PlatformAdapter } from "./adapter";

// Adapter eBay RÉEL — parle au micro-service Flask (ebay-service/), qui
// interroge les API officielles eBay (Browse + Marketplace Insights).
// Lecture seule : placeBid ne place JAMAIS d'enchère (position produit
// permanente — l'humain enchérit lui-même sur eBay).

const BASE = () => process.env.EBAY_API_URL ?? "http://localhost:5000";

type EbaySummary = {
  itemId?: string;
  title?: string;
  currentBid?: number | null;
  currency?: string | null;
  bidCount?: number | null;
  itemEndDate?: string | null;
  imageUrl?: string | null;
  condition?: string | null;
  categories?: string[];
  seller?: { name?: string | null; feedbackPercentage?: number | null; feedbackScore?: number | null };
};

export type MarketEvaluation = {
  status: "ok" | "no_data";
  median: number | null;
  low?: number;
  high?: number;
  reliable_range?: [number, number];
  sample_size?: number;
  max_profitable_bid?: number;
  current_price?: number;
  edge_pct?: number | null;
  is_below_market?: boolean | null;
  worth_bidding?: boolean | null;
  headroom?: number;
  reason?: string;
  comparables?: { title: string; soldPrice: number | null; date: string; source: string }[];
  sources?: string[];
};

function closesInSec(itemEndDate?: string | null): number {
  if (!itemEndDate) return 0;
  const end = new Date(itemEndDate).getTime();
  if (Number.isNaN(end)) return 0;
  return Math.max(0, Math.round((end - Date.now()) / 1000));
}

function toLotEvent(item: EbaySummary, category: string): LotEvent {
  const id = item.itemId ?? `ebay-${Math.random().toString(36).slice(2)}`;
  return {
    id,
    ts: Date.now(),
    lotId: id,
    title: item.title ?? "Lot eBay",
    platform: "ebay",
    imageUrl: item.imageUrl ?? undefined,
    currentBid: item.currentBid ?? 0,
    currency: "EUR",
    bidCount: item.bidCount ?? 0,
    closesInSec: closesInSec(item.itemEndDate),
    category,
    seller: {
      name: item.seller?.name ?? "vendeur eBay",
      kind: "particulier",
      sales: item.seller?.feedbackScore ?? 0,
      positivePct: item.seller?.feedbackPercentage ?? null,
    },
    attributes: item.condition ? { "État annoncé": item.condition } : undefined,
  };
}

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${BASE()}${path}`, { cache: "no-store" });
    if (!res.ok) return null; // 503 sans creds, 403 sans accès Insights… → dégrade
    return (await res.json()) as T;
  } catch {
    // service Flask éteint / injoignable → on dégrade proprement
    return null;
  }
}

export class EbayAdapter implements PlatformAdapter {
  id = "ebay" as const;

  async searchListings(category: string): Promise<LotEvent[]> {
    const data = await getJson<{ items: EbaySummary[] }>(`/auctions?q=${encodeURIComponent(category)}&limit=50`);
    if (!data?.items) return [];
    return data.items.map((i) => toLotEvent(i, category));
  }

  async getPastSales(category: string): Promise<{ title: string; soldPrice: number; date: string }[]> {
    const data = await getJson<MarketEvaluation>(`/market/median?q=${encodeURIComponent(category)}`);
    const comps = data?.comparables ?? [];
    return comps
      .filter((c) => typeof c.soldPrice === "number")
      .map((c) => ({ title: c.title, soldPrice: c.soldPrice as number, date: c.date }));
  }

  subscribeLot(): () => void {
    // eBay n'expose pas de flux temps réel ; le front rafraîchit par polling
    // (searchListings / getItem). Rien à désabonner.
    return () => {};
  }

  async placeBid(): Promise<{ ok: boolean; newCurrentBid: number }> {
    // JAMAIS d'enchère automatique — règle produit permanente.
    throw new Error("BidEdge ne place jamais d'enchère : enchéris toi-même sur eBay, d'un tap.");
  }

  // ------- au-delà de l'interface : la cote + le pré-filtre de rentabilité
  async evaluate(query: string, currentPrice?: number, targetMargin?: number): Promise<MarketEvaluation | null> {
    const params = new URLSearchParams({ q: query });
    if (currentPrice != null) params.set("current_price", String(currentPrice));
    if (targetMargin != null) params.set("target_margin", String(targetMargin));
    return getJson<MarketEvaluation>(`/market/evaluate?${params.toString()}`);
  }
}
