"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Toggle } from "@/components/settings/Toggle";
import { useApp } from "@/lib/store";
import { PLANS } from "@/lib/billing/plans";

// Réglages — compte, garde-fous, notifications, plateformes.
// Le garde-fou "confirmation humaine" est permanent : le toggle est
// verrouillé ON et ne peut JAMAIS se désactiver.

const CARD = "rounded-3xl border border-hairline bg-white px-6 py-5 shadow-card";
const LABEL = "overline";

type Plan = "chasseur" | "pro" | "equipe";

type Me = {
  user: { id: string; name: string; email: string; isSuperAdmin: boolean };
  org: {
    id: string;
    name: string;
    plan: Plan;
    planLabel: string;
    priceEUR: number;
    status: string;
    statusLabel: string;
    trialDaysLeft: number | null;
  };
};

/** "€ 600" → 600 ; null si rien d'exploitable */
function parseEuro(raw: string): number | null {
  const n = Number.parseInt(raw.replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function GuardrailInput({
  value,
  onCommit,
  label,
}: {
  value: number;
  onCommit: (n: number) => void;
  label: string;
}) {
  const [draft, setDraft] = useState(`€ ${value}`);
  useEffect(() => setDraft(`€ ${value}`), [value]);

  const commit = () => {
    const n = parseEuro(draft);
    if (n === null) {
      setDraft(`€ ${value}`);
      return;
    }
    setDraft(`€ ${n}`);
    onCommit(n);
  };

  return (
    <input
      aria-label={label}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      className="h-[38px] w-[110px] rounded-full border border-hairline bg-white text-center font-mono text-[13px]"
    />
  );
}

export default function ReglagesPage() {
  const router = useRouter();
  const guardrails = useApp((s) => s.guardrails);
  const setGuardrails = useApp((s) => s.setGuardrails);
  const notify = useApp((s) => s.notify);

  // Abonnement réel — relu à chaque montage (un changement de plan côté admin
  // est visible au prochain chargement).
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/org/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Me | null) => {
        if (alive && d) setMe(d);
      })
      .catch(() => {
        // pas connecté / réseau — la carte reste en attente
      });
    return () => {
      alive = false;
    };
  }, []);

  const org = me?.org;
  const trialing = org?.status === "trialing";

  const logout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // on redirige quand même
    }
    router.push("/login");
  };

  // Notifications — état local, défauts du prototype (ON / ON / OFF)
  const [n1, setN1] = useState(true);
  const [n2, setN2] = useState(true);
  const [n3, setN3] = useState(false);

  // Drouot pas encore connecté
  const [drouot, setDrouot] = useState(false);

  const connectedBadge = (
    <span className="inline-flex items-center rounded-full bg-up-tint px-3 py-1 text-[11.5px] font-semibold text-up-strong">
      Connecté
    </span>
  );

  return (
    <div className="flex-1 animate-fade-up overflow-y-auto px-8 py-[26px]">
      <h1 className="font-display text-[32px] font-normal tracking-[-0.01em] text-ink">
        Réglages
      </h1>
      <div className="mt-1.5 text-[13px] text-body">Ton compte et tes garde-fous.</div>

      {/* abonnement */}
      <div className={`${CARD} mt-[18px] flex items-center gap-3.5`}>
        <div className="flex flex-1 flex-col gap-1">
          <div className="flex items-center gap-[9px]">
            <span className="font-display text-[19px] font-medium tracking-[-0.01em] text-ink">
              {org ? `Plan ${org.planLabel}${trialing ? " — essai" : ""}` : "Plan"}
            </span>
            {org && (
              <span className="inline-flex items-center rounded-full bg-accent-tint px-2.5 py-[3px] text-[10.5px] font-semibold text-accent-press">
                {trialing && org.trialDaysLeft != null ? (
                  <>
                    <span className="font-mono">{org.trialDaysLeft}</span>&nbsp;j restants
                  </>
                ) : (
                  org.statusLabel
                )}
              </span>
            )}
          </div>
          <span className="text-[12.5px] text-muted">
            {org ? (
              <>
                <span className="font-mono">€{org.priceEUR}</span>/mois · {PLANS[org.plan].blurb}
              </>
            ) : null}
          </span>
        </div>
        <motion.button
          type="button"
          whileTap={{ scale: 0.96 }}
          onClick={() => notify("Ouverture du portail de facturation…")}
          className="inline-flex h-10 cursor-pointer items-center rounded-full bg-control px-[18px] text-[13px] font-semibold hover:bg-control-hover"
        >
          Gérer la facturation
        </motion.button>
      </div>

      {/* profil */}
      <div className={`${CARD} mt-3.5 flex flex-col gap-3.5`}>
        <span className={LABEL}>Profil</span>
        <div className="flex items-center gap-3.5">
          <span className="flex h-[46px] w-[46px] flex-none items-center justify-center rounded-full bg-accent-tint text-[17px] font-semibold text-accent-press">
            M
          </span>
          <div className="flex flex-1 gap-2.5">
            <input
              aria-label="Nom"
              defaultValue="Manou"
              className="h-[42px] min-w-0 flex-1 rounded-xl border border-hairline bg-white px-3.5 text-[13.5px]"
            />
            <input
              aria-label="E-mail"
              defaultValue="manou@bidedge.app"
              className="h-[42px] min-w-0 flex-[1.4] rounded-xl border border-hairline bg-white px-3.5 text-[13.5px]"
            />
            <motion.button
              type="button"
              whileTap={{ scale: 0.96 }}
              onClick={() => notify("Bientôt disponible")}
              className="inline-flex h-[42px] cursor-pointer items-center rounded-full bg-control px-4 text-[12.5px] font-semibold hover:bg-control-hover"
            >
              Français ▾
            </motion.button>
          </div>
        </div>
      </div>

      {/* enchères & garde-fous */}
      <div className={`${CARD} mt-3.5 flex flex-col gap-1`}>
        <span className={`${LABEL} mb-2`}>Enchères &amp; garde-fous</span>
        <div className="flex items-center justify-between py-2.5 text-[13.5px]">
          <span>Budget mensuel</span>
          <GuardrailInput
            label="Budget mensuel"
            value={guardrails.monthlyBudget}
            onCommit={(n) => setGuardrails({ monthlyBudget: n })}
          />
        </div>
        <div className="h-px bg-hairline" />
        <div className="flex items-center justify-between py-2.5 text-[13.5px]">
          <span>Limite par défaut sur un nouveau lot</span>
          <GuardrailInput
            label="Limite par défaut sur un nouveau lot"
            value={guardrails.defaultCeiling}
            onCommit={(n) => setGuardrails({ defaultCeiling: n })}
          />
        </div>
        <div className="h-px bg-hairline" />
        <div className="flex items-center justify-between gap-3.5 py-3 text-[13.5px]">
          <span className="flex flex-col gap-[3px]">
            <span className="font-semibold">Confirmation humaine avant chaque enchère</span>
            <span className="text-xs text-muted">
              BidEdge n&apos;enchérit jamais seul — ce garde-fou est permanent.
            </span>
          </span>
          {/* toggle verrouillé — cliquer n'importe où rappelle le principe, ne désactive JAMAIS */}
          <span
            role="button"
            tabIndex={0}
            aria-label="Garde-fou permanent — toujours actif"
            onClick={() => notify("Ce garde-fou est permanent — humain dans la boucle, toujours.")}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                notify("Ce garde-fou est permanent — humain dans la boucle, toujours.");
              }
            }}
            className="flex cursor-pointer items-center gap-[9px]"
          >
            <span className="inline-flex items-center rounded-full bg-accent-tint px-2.5 py-[3px] text-[10.5px] font-semibold text-accent-press">
              toujours actif
            </span>
            <span className="relative h-[21px] w-9 flex-none rounded-full bg-accent opacity-55">
              <span className="absolute left-[17px] top-[2px] h-[17px] w-[17px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,.25)]" />
            </span>
          </span>
        </div>
      </div>

      {/* notifications */}
      <div className={`${CARD} mt-3.5 flex flex-col gap-1`}>
        <span className={`${LABEL} mb-2`}>Notifications</span>
        <div className="flex items-center justify-between py-[9px] text-[13.5px]">
          <span>Lot repéré sous −30% de la cote</span>
          <Toggle on={n1} onToggle={() => setN1((v) => !v)} label="Lot repéré sous −30% de la cote" />
        </div>
        <div className="h-px bg-hairline" />
        <div className="flex items-center justify-between py-[9px] text-[13.5px]">
          <span>Surenchère sur un lot où tu mènes</span>
          <Toggle on={n2} onToggle={() => setN2((v) => !v)} label="Surenchère sur un lot où tu mènes" />
        </div>
        <div className="h-px bg-hairline" />
        <div className="flex items-center justify-between py-[9px] text-[13.5px]">
          <span>Fin d&apos;une enchère trackée</span>
          <Toggle on={n3} onToggle={() => setN3((v) => !v)} label="Fin d'une enchère trackée" />
        </div>
      </div>

      {/* plateformes connectées */}
      <div className={`${CARD} mt-3.5 flex flex-col gap-1`}>
        <span className={`${LABEL} mb-2`}>Plateformes connectées</span>
        <div className="flex items-center gap-3 py-[9px] text-[13.5px]">
          <span className="flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-control text-[11px] font-semibold text-body">
            eB
          </span>
          <span className="font-semibold">eBay</span>
          <span className="text-xs text-muted">manou_92</span>
          <span className="flex-1" />
          {connectedBadge}
        </div>
        <div className="h-px bg-hairline" />
        <div className="flex items-center gap-3 py-[9px] text-[13.5px]">
          <span className="flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-control text-[11px] font-semibold text-body">
            Ca
          </span>
          <span className="font-semibold">Catawiki</span>
          <span className="flex-1" />
          {connectedBadge}
        </div>
        <div className="h-px bg-hairline" />
        <div className="flex items-center gap-3 py-[9px] text-[13.5px]">
          <span className="flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-control text-[11px] font-semibold text-body">
            Dr
          </span>
          <span className="font-semibold">Drouot</span>
          <span className="flex-1" />
          {drouot ? (
            connectedBadge
          ) : (
            <motion.button
              type="button"
              whileTap={{ scale: 0.96 }}
              onClick={() => {
                setDrouot(true);
                notify("Drouot connecté via son API officielle");
              }}
              className="inline-flex h-[34px] cursor-pointer items-center rounded-full bg-control px-[15px] text-xs font-semibold hover:bg-control-hover"
            >
              Connecter
            </motion.button>
          )}
        </div>
        <div className="pt-1.5 text-[11.5px] text-muted">
          Les enchères passent par les API officielles des plateformes, jamais par scraping.
        </div>
      </div>

      {/* pied */}
      <div className="mb-2 mt-4 flex items-center">
        <button
          type="button"
          onClick={logout}
          className="cursor-pointer text-[12.5px] font-semibold text-body hover:text-ink"
        >
          Se déconnecter
        </button>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => notify("Écris-nous : support@bidedge.app")}
          className="cursor-pointer text-[12.5px] font-semibold text-down hover:underline"
        >
          Supprimer le compte
        </button>
      </div>
    </div>
  );
}
