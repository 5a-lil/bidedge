"use client";

import { motion } from "motion/react";

// La bande de cote — viz signature. Zone teal = ce que le marché paie,
// tick sombre = médiane, pin = le lot en direct. Le pin GLISSE (motion)
// à chaque changement de prix : c'est un des cinq moments animés notés.

export type CoteBandProps = {
  /** position gauche de la zone teal, en % */
  bandLeftPct: number;
  /** largeur de la zone teal, en % */
  bandWidthPct: number;
  medianPct: number;
  medianLabel: string;
  lowPct?: number;
  lowLabel?: string;
  highPct?: number;
  highLabel?: string;
  /** le lot en direct */
  pin?: { pct: number; label: string };
  className?: string;
};

export function CoteBand({
  bandLeftPct,
  bandWidthPct,
  medianPct,
  medianLabel,
  lowPct,
  lowLabel,
  highPct,
  highLabel,
  pin,
  className,
}: CoteBandProps) {
  return (
    <div className={`relative h-[58px] ${className ?? ""}`}>
      <div className="absolute inset-x-0 top-[22px] h-3 rounded-full bg-control" />
      <div
        className="absolute top-[22px] h-3 rounded-full"
        style={{
          left: `${bandLeftPct}%`,
          width: `${bandWidthPct}%`,
          background: "linear-gradient(90deg,rgba(31,107,71,.3),#1f6b47 45%,rgba(31,107,71,.3))",
        }}
      />
      <div
        className="absolute top-4 h-6 w-[2.5px] rounded-[2px] bg-accent-press"
        style={{ left: `${medianPct}%` }}
      />
      <span
        className="absolute top-0 -translate-x-1/2 font-mono text-[11px] text-accent-press"
        style={{ left: `${medianPct}%` }}
      >
        {medianLabel}
      </span>
      {/* les bornes s'effacent si le label du pin passerait dessus */}
      {lowPct !== undefined && lowLabel && (pin === undefined || Math.abs(lowPct - pin.pct) > 14) && (
        <span
          className="absolute top-10 -translate-x-1/2 font-mono text-[10.5px] text-muted"
          style={{ left: `${lowPct}%` }}
        >
          {lowLabel}
        </span>
      )}
      {highPct !== undefined && highLabel && (pin === undefined || Math.abs(highPct - pin.pct) > 14) && (
        <span
          className="absolute top-10 -translate-x-1/2 font-mono text-[10.5px] text-muted"
          style={{ left: `${highPct}%` }}
        >
          {highLabel}
        </span>
      )}
      {pin && (
        <>
          <motion.div
            className="absolute top-[18px] h-[13px] w-[13px] -translate-x-1/2 rounded-full border-[2.5px] border-white bg-accent shadow-[0_1px_4px_rgba(0,0,0,.3)]"
            initial={false}
            animate={{ left: `${pin.pct}%` }}
            transition={{ duration: 0.5, ease: [0.2, 0.9, 0.3, 1] }}
          />
          <motion.span
            className="absolute top-[38px] z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-white/95 px-2 py-0.5 text-[10.5px] font-bold text-accent-press shadow-soft"
            initial={false}
            animate={{ left: `${Math.max(8, Math.min(92, pin.pct))}%` }}
            transition={{ duration: 0.5, ease: [0.2, 0.9, 0.3, 1] }}
          >
            {pin.label}
          </motion.span>
        </>
      )}
    </div>
  );
}
