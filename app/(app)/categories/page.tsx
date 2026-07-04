"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import type { LotEvent } from "@/lib/contracts";
import { euro, fmtEdge } from "@/lib/format";
import { useApp } from "@/lib/store";
import { CoteBand } from "@/components/CoteBand";

// Catégories — la cote réelle de chaque type de produit monitoré (eBay).
// La liste est PARTAGÉE avec le radar (store.categories) : ajouter une
// catégorie ici lance son monitoring partout. Chaque carte établit la cote
// (médiane + fourchette fiable) et pointe les meilleures opportunités.

type MonitorLot = LotEvent & { edgePct: number | null; belowMarket: boolean };

type MonitorResult = {
  query: string;
  median: number | null;
  basis: "sold_90d" | "active_listings" | null;
  sampleSize: number;
  reliableRange: [number, number] | null;
  low: number | null;
  high: number | null;
  maxProfitableBid: number | null;
  count: number;
  lots: MonitorLot[];
};

const BASIS_LABEL: Record<string, string> = {
  sold_90d: "ventes conclues · 90 j",
  active_listings: "annonces actives",
};

export default function CategoriesPage() {
  const hydrated = useApp((s) => s.hydrated);
  const categories = useApp((s) => s.categories);
  const setCategories = useApp((s) => s.setCategories);
  const notify = useApp((s) => s.notify);

  const [input, setInput] = useState("");
  const [results, setResults] = useState<Record<string, MonitorResult | "error">>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});

  const fetchType = useCallback(async (type: string) => {
    setLoading((l) => ({ ...l, [type]: true }));
    try {
      const res = await fetch(`/api/monitor?q=${encodeURIComponent(type)}`);
      if (!res.ok) throw new Error();
      const data = (await res.json()) as MonitorResult;
      setResults((r) => ({ ...r, [type]: data }));
    } catch {
      setResults((r) => ({ ...r, [type]: "error" }));
    } finally {
      setLoading((l) => ({ ...l, [type]: false }));
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    for (const t of categories) if (!results[t]) fetchType(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, categories.join("|")]);

  const addCategory = () => {
    const t = input.trim();
    if (!t) {
      notify("Nomme une catégorie d'abord");
      return;
    }
    if (categories.some((c) => c.toLowerCase() === t.toLowerCase())) {
      notify("Cette catégorie est déjà scannée");
      setInput("");
      return;
    }
    setCategories([...categories, t]);
    setInput("");
    notify(`Scan lancé : ${t}`);
  };

  const removeCategory = (t: string) => {
    setCategories(categories.filter((c) => c !== t));
    setResults((r) => {
      const n = { ...r };
      delete n[t];
      return n;
    });
    notify(`« ${t} » retirée du radar`);
  };

  return (
    <div className="flex-1 animate-fade-up overflow-y-auto px-8 py-7">
      <h1 className="font-display text-[32px] font-normal tracking-[-0.01em]">Catégories scannées</h1>
      <div className="mt-1.5 text-[13.5px] text-body">
        Dis quoi chasser — BidEdge interroge eBay et établit la cote du marché en direct.
      </div>

      {/* ajout */}
      <div className="mt-5 flex gap-2.5">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") addCategory();
          }}
          placeholder="Ajouter une catégorie… ex. « casque hi-fi vintage »"
          className="h-11 flex-1 rounded-full border border-hairline bg-white px-5 text-[13.5px] text-ink shadow-soft placeholder:text-muted"
        />
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={addCategory}
          className="inline-flex h-11 items-center rounded-full bg-accent px-6 text-[13.5px] font-semibold text-white shadow-cta transition-colors hover:bg-accent-press"
        >
          Scanner
        </motion.button>
      </div>

      {/* cartes de cote */}
      <div className="mt-5 flex flex-col gap-4 pb-6">
        {categories.map((type) => (
          <CategoryCard
            key={type}
            type={type}
            result={results[type]}
            loading={!!loading[type]}
            onRemove={() => removeCategory(type)}
            onRetry={() => fetchType(type)}
          />
        ))}
        {categories.length === 0 && (
          <div className="mt-8 text-center text-[13.5px] text-body">
            Aucune catégorie scannée — ajoute un type de produit ci-dessus.
          </div>
        )}
      </div>

      <div className="mb-2 text-[11.5px] text-muted">
        Le scan propose, toi tu choisis — chaque enchère se place sur eBay, de ta main. Jamais d&apos;autobid.
      </div>
    </div>
  );
}

function CategoryCard({
  type,
  result,
  loading,
  onRemove,
  onRetry,
}: {
  type: string;
  result: MonitorResult | "error" | undefined;
  loading: boolean;
  onRemove: () => void;
  onRetry: () => void;
}) {
  const notify = useApp((s) => s.notify);
  const [alertOn, setAlertOn] = useState(true);

  const r = result !== "error" ? result : undefined;
  const hasCote = !!r && r.median != null && r.low != null && r.high != null;

  // la bande = fourchette FIABLE (p25–p75) — le min/max absolu des annonces
  // (1 € de départ, prix délirants) écraserait la viz ; l'échelle s'étend
  // autour de la fourchette fiable.
  const band: [number, number] = hasCote ? (r!.reliableRange ?? [r!.low!, r!.high!]) : [0, 1];
  const scaleMin = band[0] * 0.6;
  const scaleMax = band[1] * 1.35;
  const pct = (v: number) => Math.max(2, Math.min(98, ((v - scaleMin) / (scaleMax - scaleMin)) * 100));

  const opportunities = r?.lots.filter((l) => l.belowMarket) ?? [];
  const best = opportunities
    .filter((l) => l.currentBid > 0)
    .sort((a, b) => (a.edgePct ?? 0) - (b.edgePct ?? 0))
    .slice(0, 3);
  const pin = best[0];

  return (
    <div className="flex animate-fade-up flex-col gap-4 rounded-3xl border border-hairline bg-white px-6 py-5 shadow-card">
      {/* header */}
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="font-display text-[19px] font-medium tracking-[-0.01em]">{type}</span>
        {hasCote && (
          <span className="inline-flex items-center rounded-full bg-accent-tint px-3 py-1 text-[11px] font-bold text-accent-press">
            Cote établie
          </span>
        )}
        {loading && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-control px-3 py-1 text-[11px] font-semibold text-body">
            <span className="h-1.5 w-1.5 animate-blink rounded-full bg-accent" />
            scan en cours…
          </span>
        )}
        {r?.basis && (
          <span className="inline-flex items-center rounded-full border border-hairline bg-app px-2.5 py-1 text-[10.5px] font-medium text-muted">
            {BASIS_LABEL[r.basis] ?? r.basis}
          </span>
        )}
        <span className="flex-1" />
        {r && (
          <span className="text-xs text-muted">
            <span className="font-mono">{r.sampleSize}</span> comparables · à l&apos;instant
          </span>
        )}
        <button onClick={onRemove} className="text-xs font-semibold text-muted transition-colors hover:text-down">
          Retirer
        </button>
      </div>

      {result === "error" && (
        <div className="flex items-center gap-3 rounded-2xl bg-control px-4 py-3 text-[13px] text-body">
          Cote indisponible — vérifie que le service eBay tourne (ebay-service).
          <button onClick={onRetry} className="font-semibold text-accent-press hover:underline">
            Réessayer
          </button>
        </div>
      )}

      {loading && !r && (
        <div className="h-[76px] animate-pulse rounded-2xl bg-control" />
      )}

      {hasCote && r && (
        <div className="flex gap-8">
          {/* viz signature */}
          <div className="min-w-0 flex-1">
            <CoteBand
              bandLeftPct={pct(band[0])}
              bandWidthPct={Math.max(4, pct(band[1]) - pct(band[0]))}
              medianPct={pct(r.median!)}
              medianLabel={euro(r.median!)}
              lowPct={pct(band[0])}
              lowLabel={euro(band[0])}
              highPct={pct(band[1])}
              highLabel={euro(band[1])}
              pin={
                pin
                  ? { pct: pct(Math.max(scaleMin, pin.currentBid)), label: `meilleur lot · ${euro(pin.currentBid)}` }
                  : undefined
              }
              className="mt-1"
            />
            <div className="mt-2 text-[11px] text-muted">
              la zone teal = ce que le marché paie · le point = la meilleure enchère en cours
            </div>
          </div>

          {/* colonne décision */}
          <div className="flex w-[220px] flex-none flex-col gap-1.5 text-[12.5px] text-body">
            <span>
              <span className="font-mono font-semibold text-ink">
                €{Math.round(band[0])}–{Math.round(band[1])}
              </span>{" "}
              fourchette fiable
            </span>
            {r.maxProfitableBid != null && (
              <span>
                rentable jusqu&apos;à{" "}
                <span className="font-mono font-semibold text-accent-press">{euro(r.maxProfitableBid)}</span>
              </span>
            )}
            <span>
              <span className="font-mono">{r.count}</span> enchères actives ·{" "}
              <span className="font-mono font-semibold text-up-strong">{opportunities.length}</span> sous la cote
            </span>
            <Link href="/" className="mt-1 font-semibold text-accent transition-colors hover:text-accent-press">
              voir au radar →
            </Link>
          </div>
        </div>
      )}

      {/* meilleures opportunités */}
      {best.length > 0 && (
        <div className="flex flex-col">
          <span className="overline mb-1">Meilleures opportunités</span>
          {best.map((l, i) => (
            <div key={l.lotId}>
              {i > 0 && <div className="h-px bg-control" />}
              <div className="flex items-center gap-3 py-2 text-[12.5px]">
                <span className="min-w-0 flex-1 truncate">{l.title}</span>
                <span className="font-mono font-semibold">{euro(l.currentBid)}</span>
                {l.edgePct != null && (
                  <span className="inline-flex w-14 justify-end font-mono text-[11px] font-semibold text-up-strong">
                    {fmtEdge(l.edgePct)}
                  </span>
                )}
                {l.itemWebUrl && (
                  <a
                    href={l.itemWebUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-semibold text-accent transition-colors hover:text-accent-press"
                  >
                    ouvrir →
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {hasCote && (
        <>
          <div className="h-px bg-control" />
          <div className="flex items-center gap-3 text-[12.5px]">
            <button
              onClick={() => {
                notify(alertOn ? "Alerte désactivée" : "Alerte activée");
                setAlertOn(!alertOn);
              }}
              aria-pressed={alertOn}
              className="relative h-[21px] w-9 flex-none rounded-full transition-colors duration-200"
              style={{ background: alertOn ? "#147879" : "#cfccc3" }}
            >
              <span
                className="absolute top-0.5 h-[17px] w-[17px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,.25)] transition-[left] duration-200"
                style={{ left: alertOn ? 17 : 2 }}
              />
            </button>
            <span>
              M&apos;alerter quand un lot passe sous <b>−30%</b> de la cote
            </span>
          </div>
        </>
      )}
    </div>
  );
}
