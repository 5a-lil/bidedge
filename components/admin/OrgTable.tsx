"use client";

import { useEffect, useState } from "react";
import type { Plan, SubscriptionStatus } from "@/lib/db/schema";
import { Reveal } from "@/components/ui/taap";
import { OrgRow } from "./OrgRow";

// Table opérationnelle des tenants. Charge GET /api/admin/orgs au montage puis
// laisse chaque ligne piloter son abonnement (PATCH). Après un changement, la
// ligne est fusionnée sur place avec l'org renvoyée par l'API.

export type AdminOrg = {
  id: string;
  name: string;
  slug: string;
  plan: Plan;
  status: SubscriptionStatus;
  trialEndsAt: string | null;
  monthlyBudget: number;
  createdAt: string;
  members: number;
  planLabel: string;
  priceEUR: number;
  statusLabel: string;
  trialDaysLeft: number | null;
};

type LoadState = "loading" | "ready" | "error";

export function OrgTable() {
  const [orgs, setOrgs] = useState<AdminOrg[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [errMsg, setErrMsg] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/admin/orgs", { cache: "no-store" });
        if (!res.ok) {
          if (active) {
            setState("error");
            setErrMsg(
              res.status === 401 || res.status === 403
                ? "Accès non autorisé."
                : "Impossible de charger les organisations.",
            );
          }
          return;
        }
        const data = (await res.json()) as { orgs: AdminOrg[] };
        if (active) {
          setOrgs(data.orgs);
          setState("ready");
        }
      } catch {
        if (active) {
          setState("error");
          setErrMsg("Réseau indisponible.");
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Fusion : l'API PATCH renvoie un sous-ensemble de champs (plan, statut,
  // essai). On préserve slug / membres / date de création côté client.
  function handleUpdated(updated: Partial<AdminOrg> & { id: string }) {
    setOrgs((prev) => prev.map((o) => (o.id === updated.id ? { ...o, ...updated } : o)));
  }

  return (
    <div className="mt-7">
      {state === "ready" && (
        <div className="mb-3 flex items-center">
          <span className="overline">
            Tenants&nbsp;·&nbsp;<span className="font-mono">{orgs.length}</span>
          </span>
        </div>
      )}

      {state === "loading" && (
        <div className="flex flex-col gap-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[108px] animate-pulse rounded-card bg-panel" />
          ))}
        </div>
      )}

      {state === "error" && (
        <div className="rounded-card bg-down-tint px-5 py-4 text-[13px] font-semibold text-down">
          {errMsg}
        </div>
      )}

      {state === "ready" && orgs.length === 0 && (
        <div className="rounded-card border border-hairline bg-white px-5 py-10 text-center text-[13px] text-muted shadow-card">
          Aucune organisation pour le moment.
        </div>
      )}

      {state === "ready" && orgs.length > 0 && (
        <div className="flex flex-col gap-3">
          {orgs.map((o, i) => (
            <Reveal key={o.id} delay={Math.min(i * 0.06, 0.3)}>
              <OrgRow org={o} onUpdated={handleUpdated} />
            </Reveal>
          ))}
        </div>
      )}
    </div>
  );
}
