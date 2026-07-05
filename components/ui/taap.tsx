"use client";

import { motion, type HTMLMotionProps } from "motion/react";

// Kit UI « widget » — le langage visuel commun landing + dashboard :
// panneaux gris très arrondis, cartes blanches 21px, petits widgets flottants
// qui « poppent » (scale 0→1) et se balancent (tilt ±3°), reveals au scroll
// en montée franche avec cascade de délais.

/** Panneau de section : gris système, très arrondi (30px). */
export function Panel({ className = "", children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`rounded-[30px] bg-panel ${className}`} {...rest}>
      {children}
    </div>
  );
}

/** Carte standard : blanche, 21px, hairline + ombre discrète. */
export function Card({ className = "", children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`rounded-[21px] border border-hairline bg-white shadow-card ${className}`} {...rest}>
      {children}
    </div>
  );
}

/**
 * Reveal au scroll : montée franche (y 46px), ease-out long, une seule fois.
 * `delay` en secondes pour les cascades (.1 / .25 / .5 comme référence).
 */
export function Reveal({
  delay = 0,
  className = "",
  children,
  ...rest
}: { delay?: number } & HTMLMotionProps<"div">) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 46 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.9, delay, ease: [0.16, 1, 0.3, 1] }}
      className={className}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/**
 * Widget flottant : mini-carte qui apparaît en scale 0→1 puis, en option,
 * se balance doucement (tilt ±3°). Pour les chips « notification » posées
 * sur les visuels (héro landing, coins du dashboard).
 */
export function WidgetChip({
  appearDelay = 0,
  sway = false,
  className = "",
  children,
}: {
  appearDelay?: number;
  sway?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ scale: 0, opacity: 0 }}
      whileInView={{ scale: 1, opacity: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay: appearDelay, ease: "easeOut" }}
      className={sway ? "" : className}
    >
      {sway ? (
        <div className={`animate-tilt ${className}`}>{children}</div>
      ) : (
        children
      )}
    </motion.div>
  );
}

/** Bouton pill principal — vert enchère, tap .97. */
export function PillButton({
  className = "",
  children,
  ...rest
}: HTMLMotionProps<"button">) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      className={`inline-flex items-center justify-center rounded-full bg-accent font-semibold text-white shadow-cta transition-colors hover:bg-accent-press ${className}`}
      {...rest}
    >
      {children}
    </motion.button>
  );
}
