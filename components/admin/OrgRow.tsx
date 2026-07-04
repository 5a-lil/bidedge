"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { PLANS, PLAN_ORDER, STATUS_LABEL } from "@/lib/billing/plans";
import type { Plan, SubscriptionStatus } from "@/lib/db/schema";
import type { AdminOrg } from "./OrgTable";

// Une org = une ligne. Contrôles inline (plan, statut, essai) qui PATCH
// /api/admin/orgs/[id]. La ligne se met à jour avec l'org renvoyée ; l'état de
// chargement est géré par contrôle et un statut discret confirme l'action.

const STATUS_ORDER: SubscriptionStatus[] = [
  "trialing",
  "active",
  "past_due",
  "suspended",
  "canceled",
];

type BusyKey = "plan" | "status" | "trial7" | "trial30";
type PatchBody = { plan?: Plan; status?: SubscriptionStatus; extendTrialDays?: number };

const SELECT_CLASS =
  "h-9 cursor-pointer appearance-none rounded-full border border-hairline bg-white pl-3.5 pr-9 text-[12.5px] font-semibold text-ink outline-none transition-colors hover:bg-control focus:border-accent disabled:cursor-default disabled:opacity-55";

const TRIAL_BTN =
  "inline-flex h-9 min-w-[52px] cursor-pointer items-center justify-center rounded-full bg-control px-3 text-[12.5px] font-semibold text-ink transition-colors hover:bg-control-hover disabled:cursor-default disabled:opacity-55";

function statusBadgeClass(status: SubscriptionStatus): string {
  if (status === "active") return "bg-up-tint text-up-strong";
  if (status === "trialing") return "bg-accent-tint text-accent-press";
  return "bg-down-tint text-down";
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

export function OrgRow({
  org,
  onUpdated,
}: {
  org: AdminOrg;
  onUpdated: (org: Partial<AdminOrg> & { id: string }) => void;
}) {
  const [busy, setBusy] = useState<BusyKey | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    },
    [],
  );

  async function patch(body: PatchBody, control: BusyKey) {
    if (busy) return;
    setBusy(control);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/orgs/${org.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      // 400 = aucun changement (valeur déjà à jour) : on l'ignore en silence.
      if (res.status === 400) return;
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setErr(data?.error?.message ?? "Échec de la mise à jour");
        return;
      }
      const data = (await res.json()) as { org: Partial<AdminOrg> & { id: string } };
      onUpdated(data.org);
      setFlash(true);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setFlash(false), 1600);
    } catch {
      setErr("Réseau indisponible");
    } finally {
      setBusy(null);
    }
  }

  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="rounded-3xl border border-hairline bg-white px-5 py-4 shadow-card transition-shadow hover:shadow-lift"
    >
      {/* identité + état courant */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex min-w-40 flex-1 flex-col leading-[1.3]">
          <span className="truncate font-display text-[17px] font-medium tracking-[-0.01em] text-ink">
            {org.name}
          </span>
          <span className="truncate font-mono text-[11.5px] text-muted">{org.slug}</span>
        </div>

        <span className="inline-flex items-center gap-1.5 rounded-full bg-control px-3 py-1 text-[11.5px] font-semibold text-ink">
          {org.planLabel}
          <span className="font-mono font-semibold text-muted">€{org.priceEUR}</span>
        </span>

        <span
          className={`inline-flex items-center rounded-full px-3 py-1 text-[11.5px] font-semibold ${statusBadgeClass(org.status)}`}
        >
          {org.statusLabel}
        </span>

        {org.trialDaysLeft !== null && (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              org.trialDaysLeft > 0 ? "bg-accent-tint text-accent-press" : "bg-down-tint text-down"
            }`}
          >
            {org.trialDaysLeft > 0 ? (
              <>
                <span className="font-mono">{org.trialDaysLeft}</span>&nbsp;j d&apos;essai
              </>
            ) : (
              "essai échu"
            )}
          </span>
        )}

        <span className="inline-flex items-center gap-1 text-[12px] text-muted">
          <span className="font-mono text-body">{org.members}</span>
          {org.members > 1 ? "membres" : "membre"}
        </span>

        <span className="hidden font-mono text-[11.5px] text-muted sm:inline">
          {fmtDate(org.createdAt)}
        </span>
      </div>

      {/* contrôles opérationnels */}
      <div className="mt-3.5 flex flex-wrap items-center gap-2.5 border-t border-hairline pt-3.5">
        <div className="relative">
          <select
            value={org.plan}
            disabled={busy !== null}
            onChange={(e) => patch({ plan: e.target.value as Plan }, "plan")}
            aria-label={`Plan de ${org.name}`}
            className={SELECT_CLASS}
          >
            {PLAN_ORDER.map((p) => (
              <option key={p} value={p}>
                {PLANS[p].label} · €{PLANS[p].priceEUR}
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[9px] text-muted">
            ▾
          </span>
        </div>

        <div className="relative">
          <select
            value={org.status}
            disabled={busy !== null}
            onChange={(e) => patch({ status: e.target.value as SubscriptionStatus }, "status")}
            aria-label={`Statut de ${org.name}`}
            className={SELECT_CLASS}
          >
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[9px] text-muted">
            ▾
          </span>
        </div>

        <span className="mx-0.5 hidden h-5 w-px bg-hairline sm:block" />

        <button
          type="button"
          disabled={busy !== null}
          onClick={() => patch({ extendTrialDays: 7 }, "trial7")}
          aria-label={`Prolonger l'essai de 7 jours pour ${org.name}`}
          className={TRIAL_BTN}
        >
          {busy === "trial7" ? "…" : "+7 j"}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => patch({ extendTrialDays: 30 }, "trial30")}
          aria-label={`Prolonger l'essai de 30 jours pour ${org.name}`}
          className={TRIAL_BTN}
        >
          {busy === "trial30" ? "…" : "+30 j"}
        </button>

        {/* feedback discret */}
        <div className="ml-auto flex items-center text-[11.5px]">
          <AnimatePresence mode="wait">
            {busy !== null ? (
              <motion.span
                key="busy"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-muted"
              >
                Enregistrement…
              </motion.span>
            ) : err ? (
              <motion.span
                key="err"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="font-semibold text-down"
              >
                {err}
              </motion.span>
            ) : flash ? (
              <motion.span
                key="flash"
                initial={{ opacity: 0, y: 2 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="font-semibold text-up-strong"
              >
                Enregistré
              </motion.span>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
