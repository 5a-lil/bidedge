"use client";

import { create } from "zustand";
import type {
  FeedEvent,
  FeedSnapshot,
  GuardRails,
  HotMeta,
  JournalEntry,
  LotDetail,
  LotEvent,
  ScanProgress,
} from "@/lib/contracts";
import { SEED_JOURNAL } from "@/lib/taste";

// État client global. Le flux SSE (useFeed) alimente la partie "feed" ;
// journal, garde-fous, limites et suivis vivent en localStorage.

const LS_KEY = "bidedge.v0";

type Persisted = {
  journal: JournalEntry[];
  guardrails: GuardRails;
  limits: Record<string, number>;
  followed: string[];
  categories: string[];
  onboarded: boolean;
};

const DEFAULT_PERSISTED: Persisted = {
  journal: SEED_JOURNAL,
  guardrails: { monthlyBudget: 600, defaultCeiling: 150, humanConfirm: true },
  limits: { "seiko-6139": 210 },
  followed: [],
  // types de produits monitorés sur eBay — montres en exemple (requêtes
  // propres qui remontent de vrais lots) ; l'utilisateur en ajoute d'autres.
  categories: ["Montre vintage", "Seiko automatique"],
  onboarded: false,
};

function loadPersisted(): Persisted {
  if (typeof window === "undefined") return DEFAULT_PERSISTED;
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return DEFAULT_PERSISTED;
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    return {
      ...DEFAULT_PERSISTED,
      ...parsed,
      guardrails: { ...DEFAULT_PERSISTED.guardrails, ...parsed.guardrails, humanConfirm: true },
      limits: { ...DEFAULT_PERSISTED.limits, ...parsed.limits },
    };
  } catch {
    return DEFAULT_PERSISTED;
  }
}

function savePersisted(p: Persisted): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(p));
  } catch {
    // stockage plein / bloqué — tant pis, l'app reste fonctionnelle
  }
}

type ToastState = { id: number; message: string } | null;

export type AppState = {
  // — feed (SSE) —
  connected: boolean;
  hot: LotEvent | null;
  hotMeta: HotMeta | null;
  upcoming: LotEvent | null;
  watch: LotEvent[];
  finds: LotEvent[];
  details: Record<string, LotDetail>;
  scans: Record<string, ScanProgress>;

  // — UI —
  advisoryOpen: boolean;
  doneOpen: boolean;
  /** l'utilisateur a déclaré le résultat de la vente en cours */
  declared: boolean;
  toast: ToastState;

  // — persisté —
  hydrated: boolean;
  journal: JournalEntry[];
  guardrails: GuardRails;
  limits: Record<string, number>;
  followed: string[];
  categories: string[];
  onboarded: boolean;

  // — actions —
  hydrate: () => void;
  applyFeedEvent: (ev: FeedEvent) => void;
  setConnected: (v: boolean) => void;
  openAdvisory: () => void;
  closeAdvisory: () => void;
  openDone: () => void;
  closeDone: () => void;
  declareResult: (won: boolean) => void;
  follow: (lotId: string) => void;
  notify: (message: string) => void;
  clearToast: (id: number) => void;
  setLimit: (lotId: string, value: number) => void;
  setGuardrails: (g: Partial<Omit<GuardRails, "humanConfirm">>) => void;
  setCategories: (c: string[], opts?: { remote?: boolean }) => void;
  addJournalEntry: (e: JournalEntry) => void;
  setOnboarded: (v: boolean) => void;
  ceilingFor: (lotId: string) => number;
};

let toastSeq = 1;

export const useApp = create<AppState>()((set, get) => ({
  connected: false,
  hot: null,
  hotMeta: null,
  upcoming: null,
  watch: [],
  finds: [],
  details: {},
  scans: {},

  advisoryOpen: false,
  doneOpen: false,
  declared: false,
  toast: null,

  hydrated: false,
  ...DEFAULT_PERSISTED,

  hydrate: () => {
    if (get().hydrated) return;
    set({ ...loadPersisted(), hydrated: true });
  },

  applyFeedEvent: (ev) => {
    switch (ev.type) {
      case "snapshot": {
        const snap: FeedSnapshot = ev.data;
        const scans: Record<string, ScanProgress> = {};
        for (const s of snap.scans) scans[s.category] = s;
        set((st) => ({
          hot: snap.hot,
          hotMeta: snap.hotMeta,
          upcoming: snap.upcoming,
          watch: snap.watch,
          finds: snap.finds,
          details: snap.details,
          scans: { ...st.scans, ...scans },
          // le simulateur est reparti au début → on ré-arme la démo
          declared: snap.hotMeta.phase === "live" ? false : st.declared,
          doneOpen: snap.hotMeta.phase === "live" ? false : st.doneOpen,
        }));
        break;
      }
      case "lot": {
        const lot = ev.data;
        set((st) => {
          if (st.hot && st.hot.lotId === lot.lotId) return { hot: lot };
          if (st.upcoming && st.upcoming.lotId === lot.lotId) return { upcoming: lot };
          return {};
        });
        break;
      }
      case "meta": {
        const meta = ev.data;
        set((st) => ({
          hotMeta: meta,
          declared: meta.phase === "live" ? false : st.declared,
        }));
        break;
      }
      case "outbid": {
        get().notify("Surenchéri — nouvelle suggestion prête");
        break;
      }
      case "closed": {
        set((st) => ({ doneOpen: st.declared ? st.doneOpen : true, advisoryOpen: false }));
        break;
      }
      case "scan": {
        const s = ev.data;
        set((st) => ({ scans: { ...st.scans, [s.category]: s } }));
        break;
      }
      case "ping":
        break;
    }
  },

  setConnected: (v) => set({ connected: v }),
  openAdvisory: () => set({ advisoryOpen: true }),
  closeAdvisory: () => set({ advisoryOpen: false }),
  openDone: () => set({ doneOpen: true }),
  closeDone: () => set({ doneOpen: false }),

  declareResult: (won) => {
    const { hot, hotMeta, details, journal, declared } = get();
    // garde de ré-entrée : un double-tap pendant l'animation de sortie du
    // panneau ne doit pas créer deux entrées de journal
    if (!hot || !hotMeta || declared) return;
    const detail = details[hot.lotId];
    const price = hotMeta.finalBid ?? hot.currentBid;
    const shortCat =
      detail?.filterKey === "montres" ? "Montres" : detail?.filterKey === "ram" ? "RAM" : detail?.filterKey === "gpu" ? "GPU" : detail?.categoryLabel ?? "Lot";
    const entry: JournalEntry = {
      id: `${hot.lotId}-${Date.now()}`,
      ts: Date.now(),
      lotTitle: hot.title,
      categoryLabel: detail?.categoryLabel ?? hot.category,
      platformLabel: hot.platform === "ebay" ? "eBay" : hot.platform === "catawiki" ? "Catawiki" : "Drouot",
      outcome: won ? "won" : "lost",
      price,
      learn: won
        ? "appris : décisif quand le lot part très sous la cote"
        : "appris : ne poursuit pas au-delà du plan",
      gradient: detail?.gradient ?? "linear-gradient(140deg,#353b44,#101318)",
      meta: `${shortCat} · à l'instant · ${hot.platform === "ebay" ? "eBay" : hot.platform === "catawiki" ? "Catawiki" : "Drouot"}`,
    };
    const next = [entry, ...journal];
    set({ journal: next, declared: true, doneOpen: false });
    persist();
    get().notify(won ? "Ajouté au Journal" : "Noté — limite tenue");
  },

  follow: (lotId) => {
    set((st) => ({ followed: st.followed.includes(lotId) ? st.followed : [...st.followed, lotId] }));
    persist();
    get().notify("Ajouté au radar");
  },

  notify: (message) => {
    const id = toastSeq++;
    set({ toast: { id, message } });
    setTimeout(() => get().clearToast(id), 2600);
  },
  clearToast: (id) => set((st) => (st.toast?.id === id ? { toast: null } : {})),

  setLimit: (lotId, value) => {
    set((st) => ({ limits: { ...st.limits, [lotId]: value } }));
    persist();
  },
  setGuardrails: (g) => {
    set((st) => ({ guardrails: { ...st.guardrails, ...g, humanConfirm: true } }));
    persist();
  },
  setCategories: (c, opts) => {
    set({ categories: c });
    persist();
    // Sync org (Neon) en arrière-plan — fire-and-forget, jamais bloquant.
    // remote: false quand la liste VIENT du serveur (évite l'écho).
    if (opts?.remote !== false && typeof window !== "undefined") {
      fetch("/api/org/categories", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categories: c }),
      }).catch(() => {
        // hors-ligne / rôle observateur (403) — le local reste la référence
      });
    }
  },
  addJournalEntry: (e) => {
    set((st) => ({ journal: [e, ...st.journal] }));
    persist();
  },
  setOnboarded: (v) => {
    set({ onboarded: v });
    persist();
  },

  ceilingFor: (lotId) => {
    const { limits, guardrails } = get();
    return limits[lotId] ?? guardrails.defaultCeiling;
  },
}));

function persist(): void {
  const { journal, guardrails, limits, followed, categories, onboarded } = useApp.getState();
  savePersisted({ journal, guardrails, limits, followed, categories, onboarded });
}
