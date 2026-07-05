"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { LotEvent } from "@/lib/contracts";
import { euro, fmtEdge, fmtTime } from "@/lib/format";
import type { PlanSummary } from "@/lib/platforms/ebay";
import { RiskBadge, confidencePct, finalMaxBid, useLotVerdict } from "@/components/LotAnalysis";
import { useApp } from "@/lib/store";

// Radar — flux d'opportunités RÉELLES (eBay, données live via /api/monitor).
// L'utilisateur monitore des « types de produits » (requêtes) : montres en
// exemple, et il peut en ajouter. Chaque lot montre son écart à la cote ; les
// lots sous la cote sont mis en avant. Aucune enchère n'est placée : on ouvre
// l'annonce eBay et l'humain enchérit lui-même (position produit permanente).
// Temps réel : UNE EventSource sur /api/monitor/stream (un event `monitor`
// par type toutes les ~25 s) ; poll de secours 45 s si le flux tombe.

type MonitorLot = LotEvent & { edgePct: number | null; belowMarket: boolean };

type MonitorResult = {
  query: string;
  median: number | null;
  basis: "sold_90d" | "active_listings" | null;
  dominantCategory: string | null;
  plan: PlanSummary | null;
  sampleSize: number;
  low: number | null;
  high: number | null;
  maxProfitableBid: number | null;
  maxHours: number;
  lots: MonitorLot[];
};

type Evaluation = {
  status: string;
  median: number | null;
  low?: number;
  high?: number;
  reliable_range?: [number, number];
  sample_size?: number;
  basis?: string;
  max_profitable_bid?: number;
  edge_pct?: number | null;
  is_below_market?: boolean | null;
  worth_bidding?: boolean | null;
  headroom?: number;
  reason?: string;
  comparables?: { title: string; soldPrice: number | null; date: string; source: string }[];
};

const BASIS_LABEL: Record<string, string> = {
  sold_90d: "ventes conclues 90 j",
  active_listings: "annonces actives",
};

const WINDOWS: { value: 6 | 24 | 72; label: string }[] = [
  { value: 6, label: "6 h" },
  { value: 24, label: "24 h" },
  { value: 72, label: "3 j" },
];

// seuil d'alerte : lot au moins 30 % sous la cote
const ALERT_EDGE_PCT = -30;

export default function RadarPage() {
  const categories = useApp((s) => s.categories);
  const setCategories = useApp((s) => s.setCategories);
  const hydrated = useApp((s) => s.hydrated);
  const follow = useApp((s) => s.follow);
  const notify = useApp((s) => s.notify);

  const [results, setResults] = useState<Record<string, MonitorResult & { fetchedAt: number }>>({});
  // horloge locale : fait tourner les comptes à rebours à la seconde entre
  // deux rafraîchissements réseau (temps réel perçu)
  const [now, setNow] = useState(() => Date.now());
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [activeType, setActiveType] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<"edge" | "closing">("edge");
  const [newType, setNewType] = useState("");
  const [maxHours, setMaxHours] = useState<6 | 24 | 72>(24);
  const [alertsOn, setAlertsOn] = useState(true);
  const [selected, setSelected] = useState<{ lot: MonitorLot; type: string } | null>(null);

  // flags hors rendu : état du flux SSE, alertes déjà émises, cloche
  const streamDownRef = useRef(false);
  const alertedIdsRef = useRef<Set<string>>(new Set());
  const alertsOnRef = useRef(true);

  const types = categories;

  useEffect(() => {
    alertsOnRef.current = alertsOn;
  }, [alertsOn]);

  // permission notifications navigateur (null = API absente)
  const [notifPerm, setNotifPerm] = useState<NotificationPermission | null>(null);

  // préférence cloche persistée (après montage — pas de mismatch SSR).
  // La cloche est ACTIVE par défaut → on demande la permission navigateur dès
  // l'arrivée, sinon elle n'est jamais demandée et aucune notification ne sort.
  useEffect(() => {
    let on = true;
    try {
      if (localStorage.getItem("bidedge.alertsOn") === "false") {
        setAlertsOn(false);
        on = false;
      }
    } catch {
      // localStorage indisponible — on reste sur le défaut
    }
    if (typeof window === "undefined" || !("Notification" in window)) return;
    setNotifPerm(Notification.permission);
    if (on && Notification.permission === "default") {
      Notification.requestPermission()
        .then((p) => setNotifPerm(p))
        .catch(() => {});
    }
  }, []);

  // alerte les lots franchement sous la cote (une seule fois par lot)
  const maybeAlert = useCallback(
    (payload: MonitorResult) => {
      for (const lot of payload.lots) {
        if (lot.edgePct == null || lot.edgePct > ALERT_EDGE_PCT) continue;
        if (alertedIdsRef.current.has(lot.lotId)) continue;
        alertedIdsRef.current.add(lot.lotId);
        if (!alertsOnRef.current) continue;
        const short = lot.title.length > 52 ? `${lot.title.slice(0, 52).trimEnd()}…` : lot.title;
        const body = `Sous la cote : ${short} · ${euro(lot.currentBid)} (${fmtEdge(lot.edgePct)})`;
        notify(body);
        if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
          try {
            new Notification("BidEdge — sous la cote", { body });
          } catch {
            // constructeur indisponible (mobile) — le toast suffit
          }
        }
      }
    },
    [notify],
  );

  const fetchType = useCallback(
    async (type: string) => {
      setLoading((l) => ({ ...l, [type]: true }));
      try {
        const res = await fetch(`/api/monitor?q=${encodeURIComponent(type)}&max_hours=${maxHours}`);
        if (res.ok) {
          const data = (await res.json()) as MonitorResult;
          setResults((r) => ({ ...r, [type]: { ...data, fetchedAt: Date.now() } }));
          maybeAlert(data);
        }
      } catch {
        // service eBay injoignable — on garde ce qu'on a
      } finally {
        setLoading((l) => ({ ...l, [type]: false }));
      }
    },
    [maxHours, maybeAlert],
  );

  // au montage / ajout de type : fetch immédiat des types sans données, puis
  // UNE EventSource pour tous les types ; poll de secours 45 s si flux en erreur
  useEffect(() => {
    if (!hydrated) return;
    for (const t of types) if (!results[t]) fetchType(t);
    if (types.length === 0) return;

    streamDownRef.current = false;
    const es = new EventSource(
      `/api/monitor/stream?types=${types.map(encodeURIComponent).join("|")}&max_hours=${maxHours}`,
    );
    es.addEventListener("monitor", (e) => {
      streamDownRef.current = false;
      try {
        const payload = JSON.parse(e.data) as MonitorResult;
        setResults((r) => ({ ...r, [payload.query]: { ...payload, fetchedAt: Date.now() } }));
        maybeAlert(payload);
      } catch {
        // payload illisible — on attend le prochain event
      }
    });
    es.onopen = () => {
      streamDownRef.current = false;
    };
    es.onerror = () => {
      // EventSource se reconnecte seul ; en attendant, le poll de secours prend le relais
      streamDownRef.current = true;
    };
    const fallback = setInterval(() => {
      if (streamDownRef.current) for (const t of types) fetchType(t);
    }, 45_000);

    return () => {
      es.close();
      clearInterval(fallback);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, types.join("|"), maxHours, fetchType]);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  const changeWindow = (h: 6 | 24 | 72) => {
    if (h === maxHours) return;
    setMaxHours(h);
    setResults({}); // fenêtre différente = lots différents — on repart à zéro
  };

  const toggleAlerts = () => {
    const next = !alertsOn;
    setAlertsOn(next);
    try {
      localStorage.setItem("bidedge.alertsOn", String(next));
    } catch {
      // localStorage indisponible — préférence non persistée
    }
    if (!next || typeof window === "undefined" || !("Notification" in window)) return;
    // à l'activation : permission + notification de TEST (preuve visible)
    if (Notification.permission === "default") {
      Notification.requestPermission()
        .then((p) => {
          setNotifPerm(p);
          if (p === "granted") {
            try {
              new Notification("BidEdge", {
                body: "Alertes actives — tu seras prévenu dès qu'un lot passe sous −30 % de la cote.",
              });
            } catch {
              // constructeur indisponible — le toast suffit
            }
          } else if (p === "denied") {
            notify("Notifications bloquées par le navigateur — autorise-les dans les réglages du site");
          }
        })
        .catch(() => {});
    } else if (Notification.permission === "granted") {
      setNotifPerm("granted");
      try {
        new Notification("BidEdge", { body: "Alertes actives." });
      } catch {
        // le toast suffit
      }
    } else {
      notify("Notifications bloquées par le navigateur — autorise-les dans les réglages du site");
    }
  };

  const addType = () => {
    const t = newType.trim();
    if (!t) {
      notify("Nomme un type de produit à monitorer");
      return;
    }
    if (types.some((x) => x.toLowerCase() === t.toLowerCase())) {
      notify("Ce type est déjà monitoré");
      setNewType("");
      return;
    }
    setCategories([...types, t]);
    setNewType("");
    notify(`Monitoring lancé : ${t}`);
  };

  const removeType = (t: string) => {
    setCategories(types.filter((x) => x !== t));
    setResults((r) => {
      const n = { ...r };
      delete n[t];
      return n;
    });
    if (activeType === t) setActiveType(null);
  };

  // agrège les lots de tous les types (ou du type filtré)
  const shownTypes = activeType ? [activeType] : types;
  const allLots = useMemo(() => {
    const rows: { lot: MonitorLot; type: string }[] = [];
    for (const t of shownTypes) {
      const r = results[t];
      if (r) {
        const drift = Math.floor((now - r.fetchedAt) / 1000);
        for (const lot of r.lots) {
          rows.push({ lot: { ...lot, closesInSec: lot.closesInSec > 0 ? Math.max(0, lot.closesInSec - drift) : 0 }, type: t });
        }
      }
    }
    rows.sort((a, b) => {
      if (sortKey === "closing") return a.lot.closesInSec - b.lot.closesInSec;
      const ea = a.lot.edgePct ?? 0;
      const eb = b.lot.edgePct ?? 0;
      return ea - eb; // plus négatif (meilleur edge) d'abord
    });
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, shownTypes.join("|"), sortKey, now]);

  const opportunities = allLots.filter((r) => r.lot.belowMarket);
  const anyLoading = shownTypes.some((t) => loading[t]);
  const activePlan = activeType ? (results[activeType]?.plan ?? null) : null;

  return (
    <div className="flex-1 animate-fade-up overflow-y-auto px-8 py-[26px]">
      {/* header */}
      <div className="flex flex-wrap items-center gap-3.5">
        <span className="headline text-[34px] text-ink">Radar</span>
        <span className="inline-flex items-center gap-[7px] rounded-full bg-accent-tint px-3 py-[5px] text-xs font-semibold text-accent-press">
          <span className="h-1.5 w-1.5 animate-blink rounded-full bg-accent" />
          eBay en direct
        </span>
        {opportunities.length > 0 && (
          <span className="inline-flex items-center rounded-full bg-up-tint px-3 py-[5px] text-xs font-bold text-up-strong">
            <span className="font-mono">{opportunities.length}</span>&nbsp;sous la cote
          </span>
        )}
        <span className="flex-1" />
        {/* fenêtre de clôture */}
        <span className="inline-flex items-center gap-1 rounded-full border border-hairline bg-white p-1 pl-3">
          <span className="pr-1 text-[11.5px] font-medium text-muted">Ferme dans :</span>
          {WINDOWS.map((w) => (
            <button
              key={w.value}
              onClick={() => changeWindow(w.value)}
              className={`rounded-full px-2.5 py-1 font-mono text-[11.5px] font-semibold transition-colors ${
                maxHours === w.value ? "bg-ink text-white" : "text-body hover:bg-control"
              }`}
            >
              {w.label}
            </button>
          ))}
        </span>
        {/* cloche — alertes navigateur */}
        <button
          onClick={toggleAlerts}
          title={alertsOn ? "Alertes activées — clique pour couper" : "Alertes coupées — clique pour activer"}
          className={`inline-flex items-center gap-1.5 rounded-full border px-[13px] py-2 text-[12.5px] font-medium transition-colors ${
            alertsOn
              ? "border-accent bg-accent-tint text-accent-press"
              : "border-hairline bg-white text-muted hover:bg-control"
          }`}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.7 21a2 2 0 0 1-3.4 0" />
          </svg>
          {alertsOn ? (notifPerm === "denied" ? "Alertes (bloquées)" : "Alertes on") : "Alertes off"}
        </button>
        <button
          onClick={() => setSortKey((k) => (k === "closing" ? "edge" : "closing"))}
          className="rounded-full border border-hairline bg-white px-[15px] py-2 text-[12.5px] font-medium text-body transition-colors hover:bg-control"
        >
          Tri : {sortKey === "closing" ? "ferment bientôt" : "meilleur edge"} ⇅
        </button>
      </div>

      {/* types monitorés + ajout */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          onClick={() => setActiveType(null)}
          className={`inline-flex items-center rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
            activeType === null ? "border-ink bg-ink text-white" : "border-hairline bg-white text-body hover:bg-control"
          }`}
        >
          Tous · {types.length}
        </button>
        {types.map((t) => {
          const r = results[t];
          const active = activeType === t;
          const opps = r?.lots.filter((l) => l.belowMarket).length ?? 0;
          return (
            <span
              key={t}
              className={`group inline-flex items-center gap-1.5 rounded-full border py-1.5 pl-3.5 pr-2 text-xs font-semibold transition-colors ${
                active ? "border-accent bg-accent-tint text-accent-press" : "border-hairline bg-white text-body hover:bg-control"
              }`}
            >
              <button onClick={() => setActiveType(active ? null : t)} className="flex items-center gap-1.5">
                {t}
                {opps > 0 && <span className="font-mono text-up-strong">· {opps}</span>}
                {loading[t] && <span className="h-1.5 w-1.5 animate-blink rounded-full bg-accent" />}
              </button>
              <button
                onClick={() => removeType(t)}
                className="flex h-4 w-4 items-center justify-center rounded-full text-muted transition-colors hover:bg-white hover:text-down"
                title="Ne plus monitorer"
              >
                ×
              </button>
            </span>
          );
        })}
        <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-[#cfc9ba] bg-white py-1 pl-3 pr-1">
          <input
            value={newType}
            onChange={(e) => setNewType(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addType();
            }}
            placeholder="Ajouter un type… ex. « casque hi-fi vintage »"
            className="w-[220px] bg-transparent text-xs text-ink outline-none placeholder:text-muted"
          />
          <button
            onClick={addType}
            className="flex h-7 items-center rounded-full bg-accent px-3 text-xs font-semibold text-white transition-colors hover:bg-accent-press"
          >
            Monitorer
          </button>
        </span>
      </div>

      {/* ce que Gemini a compris de la requête du type filtré */}
      {activePlan && (
        <div className="mt-2 text-[12px] text-muted">
          Compris : {activePlan.searchQuery ?? activeType}
          {activePlan.excludeKeywords && activePlan.excludeKeywords.length > 0 && (
            <>
              {" "}· exclu : {activePlan.excludeKeywords.slice(0, 3).join(", ")}
              {activePlan.excludeKeywords.length > 3 ? "…" : ""}
            </>
          )}
          {activePlan.maxPrice != null && (
            <>
              {" "}· plafond <span className="font-mono">€{Math.round(activePlan.maxPrice)}</span>
            </>
          )}
          {(activePlan.excludedAsParts ?? 0) > 0 && (
            <>
              {" "}· <span className="font-mono">{activePlan.excludedAsParts}</span> pour pièces écartées
            </>
          )}
        </div>
      )}

      {/* état vide / chargement */}
      {allLots.length === 0 && (
        <div className="mt-10 flex flex-col items-center gap-2 text-center">
          <div className="text-[15px] font-semibold">
            {anyLoading ? "Scan des enchères eBay en cours…" : "Aucune enchère active trouvée"}
          </div>
          <div className="max-w-[420px] text-[13px] text-body">
            {anyLoading
              ? "On interroge eBay pour tes types de produits — la cote et les lots arrivent."
              : "Ajoute un type de produit à monitorer, ou vérifie que le service eBay tourne (ebay-service)."}
          </div>
        </div>
      )}

      {/* opportunités d'abord : sous la cote, triées par meilleur edge */}
      {opportunities.length > 0 && (
        <>
          <div className="overline mb-2.5 mt-[22px]">
            Opportunités — sous la cote · {opportunities.length}
            {activeType && results[activeType]?.dominantCategory && (
              <span className="ml-2 normal-case tracking-normal text-muted">
                catégorie détectée : {results[activeType]?.dominantCategory}
              </span>
            )}
          </div>
          <div className="grid grid-cols-4 gap-3">
            {opportunities.map(({ lot, type }, i) => (
              <LotCard key={lot.lotId} lot={lot} index={i} onOpen={() => setSelected({ lot, type })} />
            ))}
          </div>
        </>
      )}

      {/* le reste des enchères actives */}
      {allLots.length > opportunities.length && (
        <>
          <div className="overline mb-2.5 mt-[22px]">
            {activeType ?? "Toutes catégories"} · {allLots.length - opportunities.length} autres enchères
          </div>
          <div className="grid grid-cols-4 gap-3">
            {allLots
              .filter((r) => !r.lot.belowMarket)
              .map(({ lot, type }, i) => (
                <LotCard key={lot.lotId} lot={lot} index={i} onOpen={() => setSelected({ lot, type })} />
              ))}
          </div>
        </>
      )}

      <div className="mb-1.5 mt-4 text-[11.5px] text-muted">
        Le scan propose, toi tu choisis — et tu places chaque enchère toi-même sur eBay. Jamais d&apos;autobid.
      </div>

      <AnimatePresence>
        {selected && (
          <AdvisoryModal lot={selected.lot} type={selected.type} onClose={() => setSelected(null)} onFollow={follow} />
        )}
      </AnimatePresence>
    </div>
  );
}

function LotCard({ lot, index = 0, onOpen }: { lot: MonitorLot; index?: number; onOpen: () => void }) {
  const closingSoon = lot.closesInSec > 0 && lot.closesInSec <= 3600;
  return (
    <motion.button
      onClick={onOpen}
      whileHover={{ y: -2 }}
      style={{ animationDelay: `${Math.min(index, 11) * 0.06}s` }}
      className={`animate-rise flex flex-col gap-2 rounded-[21px] border bg-white p-3 text-left shadow-card transition-shadow hover:shadow-lift ${
        lot.belowMarket ? "border-accent" : "border-hairline"
      }`}
    >
      <div className="relative h-[92px] overflow-hidden rounded-[11px] bg-control">
        {lot.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={lot.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : null}
        {lot.belowMarket && (
          <span className="absolute left-1.5 top-1.5 inline-flex items-center rounded-full bg-up-tint px-2 py-0.5 text-[10px] font-bold text-up-strong shadow-sm">
            sous la cote
          </span>
        )}
      </div>
      <div className="line-clamp-2 min-h-[32px] text-[12.5px] font-semibold leading-[1.25]">{lot.title}</div>
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-sm font-semibold">{euro(lot.currentBid)}</span>
        {lot.edgePct != null && (
          <span
            className="font-mono text-[11px] font-semibold"
            style={{ color: lot.edgePct < 0 ? "#17714b" : "#7c828a" }}
          >
            {fmtEdge(lot.edgePct)}
          </span>
        )}
      </div>
      <div className="flex justify-between text-[10.5px] text-muted">
        <span className="font-mono" style={{ color: closingSoon ? "#c13a2e" : undefined }}>
          {lot.closesInSec > 0 ? fmtTime(lot.closesInSec) : "—"}
        </span>
        <span>{lot.bidCount > 0 ? `${lot.bidCount} ench.` : "0 ench."}</span>
      </div>
    </motion.button>
  );
}

function AdvisoryModal({
  lot,
  type,
  onClose,
  onFollow,
}: {
  lot: MonitorLot;
  type: string;
  onClose: () => void;
  onFollow: (lotId: string) => void;
}) {
  const guardrails = useApp((s) => s.guardrails);
  const [ev, setEv] = useState<Evaluation | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/market/evaluate?q=${encodeURIComponent(type)}&current_price=${lot.currentBid}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Evaluation | null) => {
        if (alive) setEv(d);
      })
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [type, lot.currentBid]);

  // analyse IA du contexte — une fois par lot, seulement si le pré-filtre
  // valide ; le verdict IRRIGUE tout le détail (bandeau, état réel, prix max)
  const worth = ev?.worth_bidding === true;
  const { verdict, state: verdictState, risk } = useLotVerdict(lot.lotId, ev?.median ?? null, worth);
  const withinBudget = lot.currentBid <= guardrails.defaultCeiling;
  const confPct = confidencePct(verdict);
  // prix max FINAL : le plus prudent entre marge sur cote et conseil IA
  const maxBid = finalMaxBid(ev?.max_profitable_bid ?? null, verdict);
  const aiAdjusted =
    maxBid != null && ev?.max_profitable_bid != null && maxBid < Math.round(ev.max_profitable_bid);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <motion.div
        className="absolute inset-0 bg-[rgba(10,11,13,.46)]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        className="relative flex max-h-[92vh] w-[620px] max-w-[92vw] flex-col gap-4 overflow-y-auto rounded-[30px] bg-white p-[26px] shadow-overlay"
        initial={{ opacity: 0, y: 20, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.97 }}
        transition={{ type: "spring", duration: 0.4, bounce: 0.22 }}
      >
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-bold uppercase tracking-[.07em] text-muted">eBay · {type}</span>
          <span className="flex-1" />
          {lot.closesInSec > 0 && (
            <span className="font-mono text-lg font-semibold" style={{ color: lot.closesInSec <= 1800 ? "#c13a2e" : "#0a0b0d" }}>
              {fmtTime(lot.closesInSec)}
            </span>
          )}
        </div>

        <div className="flex gap-4">
          <div className="h-[110px] w-[120px] flex-none overflow-hidden rounded-[14px] bg-control">
            {lot.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={lot.imageUrl} alt="" className="h-full w-full object-cover" />
            ) : null}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="headline text-[17px] leading-snug">{lot.title}</div>
            {/* le verdict IA fait partie du détail produit */}
            {verdict?.etatReel && (
              <div className="text-[12px] text-body">
                État réel (IA) : <span className="font-semibold text-ink">{verdict.etatReel}</span>
              </div>
            )}
            <div className="flex items-end gap-3">
              <span>
                <span className="text-[10.5px] font-bold uppercase tracking-[.07em] text-muted">Enchère actuelle</span>
                <br />
                <span className="font-mono text-[22px] font-semibold">{euro(lot.currentBid)}</span>
              </span>
              {lot.edgePct != null && (
                <span
                  className="mb-1 inline-flex items-center rounded-full px-2.5 py-[3px] text-[11px] font-bold"
                  style={{
                    background: lot.edgePct < 0 ? "#e4f0e7" : "#eef0f3",
                    color: lot.edgePct < 0 ? "#17714b" : "#5b616e",
                  }}
                >
                  {fmtEdge(lot.edgePct)} vs cote
                </span>
              )}
              {risk && <RiskBadge risk={risk} className="mb-1" />}
            </div>
          </div>
        </div>

        {/* verdict pré-filtre */}
        <div
          className="rounded-[14px] p-4"
          style={{
            background: loading ? "#f7f5ef" : worth ? (risk === "eviter" ? "#faeae7" : "#e4f0e7") : "#f7f5ef",
          }}
        >
          {loading ? (
            <div className="text-[13px] text-muted">Établissement de la cote…</div>
          ) : ev && ev.median != null ? (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="text-[13.5px] font-semibold"
                  style={{ color: worth ? (risk === "eviter" ? "#9c2d24" : "#125a3c") : "#1d1d1e" }}
                >
                  {worth
                    ? risk === "eviter"
                      ? "Sous la cote, mais annonce à risque"
                      : "Sous la cote, avec marge"
                    : "Pas de marge suffisante"}
                </span>
                {ev.basis && (
                  <span className="inline-flex items-center rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-muted">
                    cote : {BASIS_LABEL[ev.basis] ?? ev.basis}
                  </span>
                )}
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold ${
                    withinBudget ? "bg-up-tint text-up-strong" : "bg-panel text-muted"
                  }`}
                >
                  {withinBudget ? (
                    <>
                      dans ta limite ·&nbsp;<span className="font-mono">€{guardrails.defaultCeiling}</span>
                    </>
                  ) : (
                    <>
                      au-dessus de ta limite&nbsp;<span className="font-mono">€{guardrails.defaultCeiling}</span>
                    </>
                  )}
                </span>
              </div>
              <div className="flex flex-wrap gap-4 text-[12.5px]">
                <span>
                  Cote médiane <span className="font-mono font-semibold">{euro(ev.median)}</span>
                </span>
                {ev.low != null && ev.high != null && (
                  <span className="text-muted">
                    fourchette <span className="font-mono">€{Math.round(ev.low)}–{Math.round(ev.high)}</span>
                  </span>
                )}
                {maxBid != null && (
                  <span>
                    prix max{" "}
                    <span className="font-mono font-semibold text-accent-press">{euro(maxBid)}</span>
                    {aiAdjusted && <span className="text-[11px] text-muted"> (ajusté IA)</span>}
                  </span>
                )}
                <span className="text-muted">
                  <span className="font-mono">{ev.sample_size ?? 0}</span> comparables
                </span>
              </div>
              {ev.reason && <div className="text-[12.5px] leading-relaxed text-body">{ev.reason}</div>}
            </div>
          ) : (
            <div className="text-[13px] text-body">
              Cote indisponible pour ce type — vérifie le service eBay, ou l&apos;accès Marketplace Insights pour les
              ventes conclues.
            </div>
          )}
        </div>

        {/* lecture IA de l'annonce — l'état réel et le prix max sont déjà
            fusionnés dans le détail ci-dessus ; ici : signaux + résumé */}
        {worth && (
          <div className="rounded-[14px] bg-panel p-4">
            <div className="overline mb-2">Lecture de l&apos;annonce (IA)</div>
            {verdictState === "loading" || verdictState === "idle" ? (
              <div className="text-[13px] text-muted">Lecture de l&apos;annonce…</div>
            ) : verdictState === "done" && verdict ? (
              <div className="flex flex-col gap-2">
                {verdict.redFlags.length > 0 ? (
                  <ul className="flex flex-col gap-0.5 text-[12.5px] leading-relaxed text-warn">
                    {verdict.redFlags.map((flag, i) => (
                      <li key={i}>· {flag}</li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-[12.5px] text-up-strong">Aucun signal d&apos;alerte dans l&apos;annonce.</div>
                )}
                {verdict.resume && <div className="text-[12.5px] leading-relaxed text-body">{verdict.resume}</div>}
                {confPct != null && (
                  <div className="text-[11.5px] text-muted">
                    confiance <span className="font-mono">{confPct}%</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-[12.5px] text-muted">Analyse IA indisponible.</div>
            )}
          </div>
        )}

        {/* comparables */}
        {ev?.comparables && ev.comparables.length > 0 && (
          <div className="flex flex-col">
            {ev.comparables.slice(0, 4).map((c, i) => (
              <div key={i}>
                {i > 0 && <div className="h-px bg-control" />}
                <div className="flex justify-between py-1.5 text-[12px]">
                  <span className="truncate pr-2">{c.title}</span>
                  <span className="flex-none font-mono text-muted">{c.soldPrice != null ? euro(c.soldPrice) : "—"}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* actions — jamais d'enchère automatique */}
        <div className="flex items-center gap-3">
          {risk === "eviter" ? (
            <span className="text-[11px] font-semibold text-down">
              L&apos;IA déconseille ce lot — vérifie l&apos;annonce avant toute enchère.
            </span>
          ) : (
            <span className="text-[11px] text-muted">Tu enchéris toi-même sur eBay — pas d&apos;autobid.</span>
          )}
          <span className="flex-1" />
          <button
            onClick={() => {
              onFollow(lot.lotId);
              onClose();
            }}
            className="flex h-11 items-center rounded-full bg-control px-5 text-[13.5px] font-semibold text-ink transition-colors hover:bg-control-hover"
          >
            Suivre
          </button>
          {lot.itemWebUrl && (
            <a
              href={lot.itemWebUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-11 items-center rounded-full bg-accent px-5 text-[13.5px] font-semibold text-white shadow-cta transition-colors hover:bg-accent-press"
            >
              Ouvrir sur eBay →
            </a>
          )}
        </div>
      </motion.div>
    </div>
  );
}
