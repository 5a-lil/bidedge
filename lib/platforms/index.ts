import type { LotEvent } from "@/lib/contracts";
import type { PlatformAdapter } from "./adapter";
import { EbayAdapter } from "./ebay";
import { MockAdapter } from "./mock";

// Registre des adapters.
// - eBay : adapter RÉEL (micro-service Flask → API officielles eBay).
// - Catawiki / Drouot : pas encore d'API officielle branchée → mock en
//   attendant (leurs vrais adapters throw dans catawiki.ts / drouot.ts).
// Le swap réel se fait uniquement ici, sans toucher aux routes ni à l'UI.

const ebay = new EbayAdapter();

const adapters: Record<LotEvent["platform"], PlatformAdapter> = {
  ebay,
  catawiki: new MockAdapter("catawiki"),
  drouot: new MockAdapter("drouot"),
};

export function getAdapter(platform: LotEvent["platform"]): PlatformAdapter {
  return adapters[platform];
}

/** Accès direct à l'adapter eBay (cote / pré-filtre de rentabilité). */
export function getEbayAdapter(): EbayAdapter {
  return ebay;
}

export type { PlatformAdapter };
