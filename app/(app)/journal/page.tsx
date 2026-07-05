"use client";

import { motion } from "motion/react";
import type { JournalEntry } from "@/lib/contracts";
import { euro } from "@/lib/format";
import { useApp } from "@/lib/store";
import { Reveal } from "@/components/ui/taap";

// Journal — la mémoire des décisions. Chaque motif appris est réinjecté
// dans les advisories suivantes : le copilote s'adapte, l'humain décide.

function badgeOf(e: JournalEntry): { text: string; price: string | null; className: string } {
  if (e.outcome === "won")
    return {
      text: "Gagné ·",
      price: e.price != null ? euro(e.price) : "—",
      className: "bg-up-tint text-up-strong",
    };
  if (e.outcome === "lost")
    return {
      text: "Perdu · parti",
      price: e.price != null ? euro(e.price) : "—",
      className: "bg-down-tint text-down",
    };
  return { text: "Passé", price: null, className: "bg-control text-body" };
}

export default function JournalPage() {
  const journal = useApp((s) => s.journal);
  const wonCount = journal.filter((e) => e.outcome === "won").length;

  return (
    <div className="flex-1 animate-fade-up overflow-y-auto px-8 py-[26px]">
      {/* header */}
      <div className="overline">Tes décisions nourrissent chaque advisory</div>
      <div className="mt-2 flex items-baseline gap-3">
        <h1 className="headline text-[34px] text-ink">Journal</h1>
        <span className="text-[13px] text-body">
          <span className="font-mono">{journal.length}</span> décisions ·{" "}
          <span className="font-mono">{wonCount}</span> {wonCount > 1 ? "gagnées" : "gagnée"}
        </span>
      </div>

      {/* décisions — mini-cartes « widget » */}
      <Reveal className="mt-5 flex flex-col gap-2">
        {journal.map((e) => {
          const badge = badgeOf(e);
          return (
            <motion.div
              key={e.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="flex items-center gap-3.5 rounded-widget bg-panel px-3 py-2.5"
            >
              <div className="h-11 w-11 flex-none rounded-xl" style={{ background: e.gradient }} />
              <div className="w-[215px] flex-none">
                <div className="text-[13.5px] font-semibold text-ink">{e.lotTitle}</div>
                <div className="text-[11.5px] text-muted">{e.meta}</div>
              </div>
              <span className="flex-1 rounded-lg bg-accent-tint px-[11px] py-[7px] text-xs text-accent-press">
                {e.learn}
              </span>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-[13px] py-1.5 text-xs font-semibold ${badge.className}`}
              >
                {badge.text}
                {badge.price != null && <span className="font-mono">{badge.price}</span>}
              </span>
            </motion.div>
          );
        })}
      </Reveal>

      <Reveal delay={0.1}>
        <div className="mt-4 rounded-widget bg-accent-tint px-5 py-3.5 text-[12.5px] text-accent-press">
          {"Ces motifs sont réinjectés dans chaque advisory — « tu as tenu sous €240 la dernière fois, je suggère €220 ici »."}
        </div>
      </Reveal>
    </div>
  );
}
