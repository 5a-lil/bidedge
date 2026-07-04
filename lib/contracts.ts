// ⚠ Contrats partagés — figés en premier. Ne pas modifier LotEvent / BidAdvisory
// sans accord d'équipe : la couche plateformes (mock aujourd'hui, API officielles
// eBay/Catawiki/Drouot demain) et toute l'UI en dépendent.

export type LotEvent = {
  id: string;
  ts: number;
  lotId: string;
  title: string;
  platform: "ebay" | "catawiki" | "drouot";
  imageUrl?: string;
  itemWebUrl?: string; // lien vers l'annonce — l'humain enchérit là lui-même
  currentBid: number;
  currency: "EUR";
  bidCount: number;
  closesInSec: number; // l'horloge qui ferme
  category: string; // ex. "montres-seiko-vintage"
  seller: {
    name: string;
    kind: "pro" | "particulier" | "maison";
    sales: number;
    positivePct: number | null;
    memberSince?: string;
    location?: string;
  };
  attributes?: Record<string, string>;
};

export type BidAdvisory = {
  lotId: string;
  suggestedBid: number; // enchère courante + incrément — PAS un max
  userCeiling: number; // la limite fixée par l'utilisateur
  currency: "EUR";
  marketBand: {
    low: number;
    median: number;
    high: number;
    salesCount: number;
    sources: string[];
  };
  edgePct: number; // ex. -62
  comparables: { title: string; soldPrice: number; source: string; date: string }[];
  agentRead?: { text: string; tone: "ok" | "warn" }; // ex. "photos limitées — demander le dos du boîtier"
  advisory: string; // phrase de décision, ton calme
  learnsFrom?: string; // rappel du journal ("tu as tenu sous €240 la dernière fois")
};

// ————————————————————————————————————————————————————————————————
// Types "wire" du flux SSE et de l'état client. Pas partie du contrat
// plateformes — libres d'évoluer.

export type HotPhase = "live" | "ended";

export type HotMeta = {
  lotId: string;
  phase: HotPhase;
  /** qui mène : l'utilisateur, un adversaire, ou personne depuis le départ */
  leader: "user" | "other" | null;
  /** true quand l'utilisateur menait et vient d'être surenchéri */
  outbid: boolean;
  /** secondes depuis la dernière enchère (toutes parties confondues) */
  lastBidSecAgo: number;
  /** prix final une fois phase === "ended" */
  finalBid: number | null;
  /** l'utilisateur menait-il à la fermeture */
  userWasLeading: boolean;
  startPrice: number;
};

export type MarketBand = {
  low: number;
  median: number;
  high: number;
  salesCount: number;
  sources: string[];
};

export type LotDetail = {
  /** gradient CSS de la vignette (les visuels du proto sont des dégradés) */
  gradient: string;
  etat: string;
  read: { text: string; tone: "ok" | "warn" };
  comparables: { title: string; soldPrice: number; source: string; date: string }[];
  band: MarketBand;
  /** libellé humain de la catégorie, ex. "Montres Seiko vintage" */
  categoryLabel: string;
  /** clé de filtre radar : montres | ram | gpu */
  filterKey: string;
  /** méta vendeur affichable ("membre depuis 2016 · Osaka, JP") */
  sellerMeta: string;
  /** initiales de l'avatar vendeur, curées ("TokyoTimeShop" → "TT") */
  sellerInitials: string;
  sellerTrust: { text: string; tone: "ok" | "warn" | "neutral" };
  /** sous-titre pour les cartes "Trouvés par le scan" */
  findSub?: string;
};

export type ScanProgress = {
  category: string;
  label: string;
  /** 0–100 */
  pct: number;
  step: "past-sales" | "live-search" | "calibration" | "done";
  pastSalesCount: number;
  band: MarketBand | null;
};

export type FeedSnapshot = {
  serverTime: number;
  hot: LotEvent;
  hotMeta: HotMeta;
  /** deuxième lot en approche ("suggestion en préparation…") */
  upcoming: LotEvent;
  watch: LotEvent[];
  finds: LotEvent[];
  details: Record<string, LotDetail>;
  scans: ScanProgress[];
};

export type FeedEvent =
  | { type: "snapshot"; data: FeedSnapshot }
  | { type: "lot"; data: LotEvent }
  | { type: "meta"; data: HotMeta }
  | { type: "outbid"; data: { lotId: string; newCurrentBid: number } }
  | { type: "closed"; data: { lotId: string; finalBid: number; userWasLeading: boolean } }
  | { type: "scan"; data: ScanProgress }
  | { type: "ping"; data: { t: number } };

// ————————————————————————————————————————————————————————————————
// Journal & garde-fous — vivent en localStorage côté client (pas de DB en v0).

export type JournalEntry = {
  id: string;
  ts: number;
  lotTitle: string;
  categoryLabel: string;
  platformLabel: string;
  outcome: "won" | "lost" | "passed";
  /** prix final (gagné) ou prix de départ de l'adjudication (perdu) */
  price: number | null;
  learn: string;
  gradient: string;
  /** méta affichée ("Montres · à l'instant · eBay") */
  meta: string;
};

export type GuardRails = {
  monthlyBudget: number;
  defaultCeiling: number;
  /** verrouillé ON — position produit permanente, jamais désactivable */
  humanConfirm: true;
};
