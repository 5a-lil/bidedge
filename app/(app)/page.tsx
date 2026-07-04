"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { LotEvent } from "@/lib/contracts";
import { euro, fmtEdge, fmtTime } from "@/lib/format";
import { useApp } from "@/lib/store";

// Radar — flux d'opportunités RÉELLES (eBay, données live via /api/monitor).
// L'utilisateur monitore des « types de produits » (requêtes) : montres en
// exemple, et il peut en ajouter. Chaque lot montre son écart à la cote ; les
// lots sous la cote sont mis en avant. Aucune enchère n'est placée : on ouvre
// l'annonce eBay et l'humain enchérit lui-même (position produit permanente).

type MonitorLot = LotEvent & { edgePct: number | null; belowMarket: boolean };

type MonitorResult = {
  query: string;
  median: number | null;
  basis: "sold_90d" | "active_listings" | null;
  sampleSize: number;
  low: number | null;
  high: number | null;
  maxProfitableBid: number | null;
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

export default function RadarPage() {
  const categories = useApp((s) => s.categories);
  const setCategories = useApp((s) => s.setCategories);
  const hydrated = useApp((s) => s.hydrated);
  const follow = useApp((s) => s.follow);
  const notify = useApp((s) => s.notify);

  const [results, setResults] = useState<Record<string, MonitorResult>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [activeType, setActiveType] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<"edge" | "closing">("edge");
  const [newType, setNewType] = useState("");
  const [selected, setSelected] = useState<{ lot: MonitorLot; type: string } | null>(null);

  const types = categories;

  const fetchType = useCallback(async (type: string) => {
    setLoading((l) => ({ ...l, [type]: true }));
    try {
      const res = await fetch(`/api/monitor?q=${encodeURIComponent(type)}`);
      if (res.ok) {
        const data = (await res.json()) as MonitorResult;
        setResults((r) => ({ ...r, [type]: data }));
      }
    } catch {
      // service eBay injoignable — on garde ce qu'on a
    } finally {
      setLoading((l) => ({ ...l, [type]: false }));
    }
  }, []);

  // charge chaque type au montage / quand la liste change, puis rafraîchit /60 s
  useEffect(() => {
    if (!hydrated) return;
    for (const t of types) if (!results[t]) fetchType(t);
    const iv = setInterval(() => {
      for (const t of types) fetchType(t);
    }, 60_000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, types.join("|")]);

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
      if (r) for (const lot of r.lots) rows.push({ lot, type: t });
    }
    rows.sort((a, b) => {
      if (sortKey === "closing") return a.lot.closesInSec - b.lot.closesInSec;
      const ea = a.lot.edgePct ?? 0;
      const eb = b.lot.edgePct ?? 0;
      return ea - eb; // plus négatif (meilleur edge) d'abord
    });
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, shownTypes.join("|"), sortKey]);

  const opportunities = allLots.filter((r) => r.lot.belowMarket);
  const anyLoading = shownTypes.some((t) => loading[t]);

  return (
    <div className="flex-1 animate-fade-up overflow-y-auto px-8 py-[26px]">
      {/* header */}
      <div className="flex items-center gap-3.5">
        <span className="font-display text-[32px] font-normal tracking-[-0.01em]">Radar</span>
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
        <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-[#c9ced6] bg-white py-1 pl-3 pr-1">
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

      {/* grille de lots */}
      {allLots.length > 0 && (
        <>
          <div className="overline mb-2.5 mt-[22px]">
            {activeType ?? "Toutes catégories"} · {allLots.length} enchères actives
          </div>
          <div className="grid grid-cols-4 gap-3">
            {allLots.map(({ lot, type }) => (
              <LotCard key={lot.lotId} lot={lot} onOpen={() => setSelected({ lot, type })} />
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

function LotCard({ lot, onOpen }: { lot: MonitorLot; onOpen: () => void }) {
  const closingSoon = lot.closesInSec > 0 && lot.closesInSec <= 3600;
  return (
    <motion.button
      onClick={onOpen}
      whileHover={{ y: -2 }}
      className={`flex animate-fade-up flex-col gap-2 rounded-2xl border bg-white p-3 text-left transition-shadow hover:shadow-[0_8px_22px_rgba(10,11,13,.08)] ${
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
            style={{ color: lot.edgePct < 0 ? "#059460" : "#7c828a" }}
          >
            {fmtEdge(lot.edgePct)}
          </span>
        )}
      </div>
      <div className="flex justify-between text-[10.5px] text-muted">
        <span className="font-mono" style={{ color: closingSoon ? "#cf202f" : undefined }}>
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

  const worth = ev?.worth_bidding === true;

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
        className="relative flex max-h-[92vh] w-[620px] max-w-[92vw] flex-col gap-4 overflow-y-auto rounded-3xl bg-white p-[26px] shadow-overlay"
        initial={{ opacity: 0, y: 20, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.97 }}
        transition={{ type: "spring", duration: 0.4, bounce: 0.22 }}
      >
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-bold uppercase tracking-[.07em] text-muted">eBay · {type}</span>
          <span className="flex-1" />
          {lot.closesInSec > 0 && (
            <span className="font-mono text-lg font-semibold" style={{ color: lot.closesInSec <= 1800 ? "#cf202f" : "#0a0b0d" }}>
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
            <div className="font-display text-[17px] font-medium leading-snug tracking-[-0.005em]">{lot.title}</div>
            <div className="flex items-end gap-4">
              <span>
                <span className="text-[10.5px] font-bold uppercase tracking-[.07em] text-muted">Enchère actuelle</span>
                <br />
                <span className="font-mono text-[22px] font-semibold">{euro(lot.currentBid)}</span>
              </span>
              {lot.edgePct != null && (
                <span
                  className="mb-1 inline-flex items-center rounded-full px-2.5 py-[3px] text-[11px] font-bold"
                  style={{
                    background: lot.edgePct < 0 ? "#e6f6ef" : "#eef0f3",
                    color: lot.edgePct < 0 ? "#059460" : "#5b616e",
                  }}
                >
                  {fmtEdge(lot.edgePct)} vs cote
                </span>
              )}
            </div>
          </div>
        </div>

        {/* verdict pré-filtre */}
        <div
          className="rounded-[14px] p-4"
          style={{ background: loading ? "#f7f7f7" : worth ? "#e6f6ef" : "#f7f7f7" }}
        >
          {loading ? (
            <div className="text-[13px] text-muted">Établissement de la cote…</div>
          ) : ev && ev.median != null ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="text-[13.5px] font-semibold" style={{ color: worth ? "#046b46" : "#0a0b0d" }}>
                  {worth ? "Sous la cote, avec marge" : "Pas de marge suffisante"}
                </span>
                {ev.basis && (
                  <span className="inline-flex items-center rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-muted">
                    cote : {BASIS_LABEL[ev.basis] ?? ev.basis}
                  </span>
                )}
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
                {ev.max_profitable_bid != null && (
                  <span>
                    rentable jusqu&apos;à{" "}
                    <span className="font-mono font-semibold text-accent-press">{euro(ev.max_profitable_bid)}</span>
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
          <span className="text-[11px] text-muted">Tu enchéris toi-même sur eBay — pas d&apos;autobid.</span>
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
