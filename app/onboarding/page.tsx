"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useApp } from "@/lib/store";
import { Toast } from "@/components/Toast";

// Onboarding 5 étapes — hors du layout (app) : hydrate() au mount, <Toast /> monté ici.
// Rail clair à gauche (progression), cartes blanches animées à droite.

type Cat = { name: string; on: boolean };

const INITIAL_CATS: Cat[] = [
  { name: "Montres vintage", on: true },
  { name: "RAM & composants", on: true },
  { name: "GPU & hardware", on: false },
  { name: "Game Boy & rétro", on: false },
  { name: "Claviers mécaniques", on: false },
  { name: "Objectifs photo", on: false },
];

const RAIL_STEPS = [
  { n: 1, label: "Compte" },
  { n: 2, label: "Catégories" },
  { n: 3, label: "Garde-fous" },
  { n: 4, label: "Plateformes" },
];

const PLATFORMS = [
  { id: "ebay", ini: "eB", name: "eBay" },
  { id: "catawiki", ini: "Ca", name: "Catawiki" },
  { id: "drouot", ini: "Dr", name: "Drouot" },
] as const;

type PlatformId = (typeof PLATFORMS)[number]["id"];

/** "€ 600" → 600 · valeur illisible → null */
function parseEuro(v: string): number | null {
  const n = parseInt(v.replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const EASE: [number, number, number, number] = [0.2, 0.9, 0.3, 1];

export default function OnboardingPage() {
  const router = useRouter();
  const hydrate = useApp((s) => s.hydrate);
  const notify = useApp((s) => s.notify);
  const setCategories = useApp((s) => s.setCategories);
  const setGuardrails = useApp((s) => s.setGuardrails);
  const setOnboarded = useApp((s) => s.setOnboarded);

  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [mail, setMail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [cats, setCats] = useState<Cat[]>(INITIAL_CATS);
  const [custom, setCustom] = useState("");
  const [budget, setBudget] = useState("€ 600");
  const [ceiling, setCeiling] = useState("€ 150");
  const [plat, setPlat] = useState<Record<PlatformId, boolean>>({
    ebay: false,
    catawiki: false,
    drouot: false,
  });
  const [scan, setScan] = useState(0);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Progression du premier scan : +3.4/s tant que l'étape 5 est affichée.
  useEffect(() => {
    if (step !== 5) return;
    const iv = setInterval(() => setScan((p) => Math.min(100, p + 3.4)), 1000);
    return () => clearInterval(iv);
  }, [step]);

  const picked = cats.filter((c) => c.on);

  const toggleCat = (i: number) =>
    setCats((cs) => cs.map((c, j) => (j === i ? { ...c, on: !c.on } : c)));

  const addCustom = () => {
    const v = custom.trim();
    if (!v) return;
    setCats((cs) => [...cs, { name: v, on: true }]);
    setCustom("");
  };

  const next = () => {
    if (step === 1) {
      // La création réelle du compte se fait à la dernière étape (atomique) —
      // ici on valide juste de quoi éviter un aller-retour à la fin.
      if (!name.trim()) {
        setErr("Indique ton prénom.");
        return;
      }
      if (!mail.includes("@")) {
        setErr("E-mail invalide.");
        return;
      }
      if (pass.length < 6) {
        setErr("Mot de passe : 6 caractères minimum.");
        return;
      }
      setErr(null);
    }
    if (step === 2 && picked.length === 0) {
      notify("Choisis au moins une catégorie");
      return;
    }
    if (step === 4) setScan(0);
    setStep((s) => Math.min(5, s + 1));
  };

  const back = () => setStep((s) => Math.max(1, s - 1));

  const connect = (id: PlatformId) => {
    setPlat((p) => ({ ...p, [id]: true }));
    if (id === "drouot") notify("Drouot connecté via son API officielle");
  };

  const finish = async () => {
    if (submitting) return;
    setSubmitting(true);

    const labels = picked.map((c) => c.name);
    const b = parseEuro(budget);
    const l = parseEuro(ceiling);

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: mail.trim(),
          password: pass,
          categories: labels,
          ...(b !== null ? { monthlyBudget: b } : {}),
          ...(l !== null ? { defaultCeiling: l } : {}),
        }),
      });

      if (res.ok) {
        // En complément de la création serveur : on garde l'état client à jour.
        setCategories(labels);
        setGuardrails({
          ...(b !== null ? { monthlyBudget: b } : {}),
          ...(l !== null ? { defaultCeiling: l } : {}),
        });
        setOnboarded(true);
        notify("Premier scan terminé — bonne chasse");
        // navigation dure : le cookie de session vient d'être posé, il faut
        // retraverser le middleware (le cache router resservirait la landing)
        window.location.assign("/");
        return;
      }

      if (res.status === 409) {
        // e-mail déjà pris → retour à l'étape 1, erreur inline
        setErr("Un compte existe déjà avec cet e-mail.");
        setStep(1);
        setSubmitting(false);
        return;
      }

      // 422 (ou autre) → on affiche le message renvoyé par le serveur
      let message = "Impossible de créer le compte. Vérifie tes informations.";
      try {
        const data = (await res.json()) as { error?: { message?: string } };
        if (data.error?.message) message = data.error.message;
      } catch {
        // corps illisible — message par défaut
      }
      notify(message);
      setSubmitting(false);
    } catch {
      notify("Création impossible. Réessaie dans un instant.");
      setSubmitting(false);
    }
  };

  const pct = `${Math.round(scan)}%`;
  const scanLabel =
    scan < 35
      ? `Collecte des ventes passées sur ${picked.length} catégorie(s)…`
      : scan < 75
        ? "Recherche live des annonces en cours…"
        : "Calibration de la cote — comparaison des sources…";

  const cardBase = "max-w-full flex flex-col rounded-card border border-hairline bg-white shadow-pop";
  const cardBySteps: Record<number, string> = {
    1: `${cardBase} w-[520px] gap-[14px] p-[34px]`,
    2: `${cardBase} w-[560px] gap-4 p-[34px]`,
    3: `${cardBase} w-[540px] gap-[6px] p-[34px]`,
    4: `${cardBase} w-[540px] gap-[6px] p-[34px]`,
    5: `${cardBase} w-[520px] gap-4 p-[38px] text-center`,
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Rail clair — progression */}
      <div className="flex w-[300px] flex-none flex-col border-r border-hairline bg-white px-7 py-8">
        <div className="headline text-[20px] text-ink">
          Bid<span className="text-accent-press">Edge</span>
        </div>
        <div className="mt-[44px] flex flex-col gap-[22px]">
          {RAIL_STEPS.map((st) => {
            const done = step > st.n || step === 5;
            const cur = step === st.n;
            return (
              <div key={st.n} className="flex items-center gap-[13px]">
                <span
                  className={`flex h-7 w-7 flex-none items-center justify-center rounded-full text-xs font-bold ${
                    done
                      ? "border border-accent bg-accent text-white"
                      : cur
                        ? "border border-accent bg-accent text-white shadow-cta"
                        : "border border-hairline bg-white text-muted"
                  }`}
                >
                  {done ? "✓" : st.n}
                </span>
                <span
                  className={`text-[13.5px] font-semibold ${done || cur ? "text-ink" : "text-muted"}`}
                >
                  {st.label}
                </span>
              </div>
            );
          })}
        </div>
        <div className="flex-1" />
        <div className="text-xs leading-[1.5] text-muted">
          Essai Pro 14 jours, sans carte.
          <br />
          Enchères via les API officielles — jamais de bot.
        </div>
      </div>

      {/* Zone claire — cartes d'étape */}
      <div className="flex min-w-0 flex-1 items-center justify-center overflow-y-auto bg-app p-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.98 }}
            transition={{ duration: 0.35, ease: EASE }}
            className={cardBySteps[step]}
          >
            {step === 1 && (
              <>
                <div className="headline text-[28px] text-ink">
                  Crée ton compte
                </div>
                <div className="-mt-[6px] text-[13.5px] text-body">
                  Deux minutes, et ton radar commence à chasser.
                </div>
                <input
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (err) setErr(null);
                  }}
                  placeholder="Prénom"
                  className="h-[46px] rounded-xl border border-hairline bg-white px-4 text-sm"
                />
                <input
                  value={mail}
                  onChange={(e) => {
                    setMail(e.target.value);
                    if (err) setErr(null);
                  }}
                  placeholder="E-mail"
                  type="email"
                  autoComplete="email"
                  className="h-[46px] rounded-xl border border-hairline bg-white px-4 text-sm"
                />
                <input
                  value={pass}
                  onChange={(e) => {
                    setPass(e.target.value);
                    if (err) setErr(null);
                  }}
                  placeholder="Mot de passe"
                  type="password"
                  autoComplete="new-password"
                  className="h-[46px] rounded-xl border border-hairline bg-white px-4 text-sm"
                />
                {err && <div className="-mt-1 text-[13px] leading-snug text-down">{err}</div>}
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={next}
                  className="mt-1 flex h-12 cursor-pointer items-center justify-center rounded-full bg-accent text-[14.5px] font-semibold text-white transition-colors hover:bg-accent-press"
                >
                  Continuer
                </motion.button>
                <div className="text-center text-[13px] text-body">
                  Déjà un compte ?{" "}
                  <button
                    onClick={() => router.push("/login")}
                    className="cursor-pointer font-semibold text-accent transition-colors hover:text-accent-press"
                  >
                    Se connecter
                  </button>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <div className="headline text-[28px] text-ink">
                  Que chasses-tu ?
                </div>
                <div className="-mt-2 text-[13.5px] text-body">
                  Choisis au moins une catégorie. BidEdge en établira la cote à partir des ventes
                  réelles.
                </div>
                <div className="flex flex-wrap gap-[9px]">
                  {cats.map((c, i) => (
                    <button
                      key={c.name}
                      onClick={() => toggleCat(i)}
                      className={`inline-flex cursor-pointer items-center gap-[7px] rounded-full border-[1.5px] px-4 py-[9px] text-[13px] font-semibold transition-colors ${
                        c.on
                          ? "border-accent bg-accent-tint text-accent-press"
                          : "border-hairline bg-white text-body"
                      }`}
                    >
                      <span>{c.on ? "✓" : "+"}</span> {c.name}
                    </button>
                  ))}
                </div>
                <div className="flex gap-[9px]">
                  <input
                    value={custom}
                    onChange={(e) => setCustom(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") addCustom();
                    }}
                    placeholder="Autre chose ? ex. « vinyles jazz 60s »"
                    className="h-[42px] flex-1 rounded-full border border-hairline bg-white px-[17px] text-[13px]"
                  />
                  <button
                    onClick={addCustom}
                    className="inline-flex h-[42px] cursor-pointer items-center rounded-full bg-control px-[17px] text-[13px] font-semibold transition-colors hover:bg-control-hover"
                  >
                    Ajouter
                  </button>
                </div>
                <div className="mt-1 flex items-center gap-3">
                  <button
                    onClick={back}
                    className="inline-flex h-[46px] cursor-pointer items-center rounded-full bg-control px-5 text-[13.5px] font-semibold transition-colors hover:bg-control-hover"
                  >
                    Retour
                  </button>
                  <span className="flex-1" />
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={next}
                    className={`inline-flex h-12 cursor-pointer items-center rounded-full px-6 text-[14.5px] font-semibold text-white transition-colors ${
                      picked.length === 0
                        ? "bg-accent-disabled"
                        : "bg-accent hover:bg-accent-press"
                    }`}
                  >
                    {`Continuer · ${picked.length} catégorie(s)`}
                  </motion.button>
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <div className="headline text-[28px] text-ink">
                  Tes garde-fous
                </div>
                <div className="mb-3 mt-[2px] text-[13.5px] text-body">
                  Fixés à froid, respectés à chaud. Tu pourras les ajuster dans Réglages.
                </div>
                <div className="flex items-center justify-between py-[11px] text-[13.5px]">
                  <span>Budget mensuel d&apos;enchères</span>
                  <input
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                    className="h-10 w-[120px] rounded-full border border-hairline bg-white px-[14px] text-center font-mono text-[13px]"
                  />
                </div>
                <div className="h-px bg-control" />
                <div className="flex items-center justify-between py-[11px] text-[13.5px]">
                  <span>Limite par défaut sur un nouveau lot</span>
                  <input
                    value={ceiling}
                    onChange={(e) => setCeiling(e.target.value)}
                    className="h-10 w-[120px] rounded-full border border-hairline bg-white px-[14px] text-center font-mono text-[13px]"
                  />
                </div>
                <div className="h-px bg-control" />
                <div className="flex items-center justify-between gap-[14px] py-[13px] text-[13.5px]">
                  <span className="flex flex-col gap-[3px]">
                    <span className="font-semibold">Confirmation humaine avant chaque enchère</span>
                    <span className="text-xs text-muted">
                      BidEdge n&apos;enchérit jamais seul — ce garde-fou est permanent.
                    </span>
                  </span>
                  <span className="flex items-center gap-[9px]">
                    <span className="inline-flex items-center rounded-full bg-accent-tint px-[10px] py-[3px] text-[10.5px] font-bold text-accent-press">
                      toujours actif
                    </span>
                    <button
                      onClick={() =>
                        notify("Ce garde-fou est permanent — humain dans la boucle, toujours.")
                      }
                      aria-label="Confirmation humaine — toujours active"
                      className="relative h-[21px] w-9 flex-none cursor-default rounded-full bg-accent opacity-55"
                    >
                      <span className="absolute left-[17px] top-[2px] h-[17px] w-[17px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,.25)]" />
                    </button>
                  </span>
                </div>
                <div className="mt-[10px] flex items-center gap-3">
                  <button
                    onClick={back}
                    className="inline-flex h-[46px] cursor-pointer items-center rounded-full bg-control px-5 text-[13.5px] font-semibold transition-colors hover:bg-control-hover"
                  >
                    Retour
                  </button>
                  <span className="flex-1" />
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={next}
                    className="inline-flex h-12 cursor-pointer items-center rounded-full bg-accent px-6 text-[14.5px] font-semibold text-white transition-colors hover:bg-accent-press"
                  >
                    Continuer
                  </motion.button>
                </div>
              </>
            )}

            {step === 4 && (
              <>
                <div className="headline text-[28px] text-ink">
                  Connecte tes plateformes
                </div>
                <div className="mb-3 mt-[2px] text-[13.5px] text-body">
                  Via leurs API officielles. Sans connexion, BidEdge suggère — et tu places
                  l&apos;enchère toi-même.
                </div>
                {PLATFORMS.map((p, i) => (
                  <div key={p.id}>
                    {i > 0 && <div className="h-px bg-control" />}
                    <div className="flex items-center gap-3 py-[10px] text-[13.5px]">
                      <span className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-control text-[11px] font-bold text-body">
                        {p.ini}
                      </span>
                      <span className="font-semibold">{p.name}</span>
                      <span className="flex-1" />
                      {plat[p.id] ? (
                        <span className="inline-flex items-center rounded-full bg-up-tint px-[13px] py-[5px] text-[11.5px] font-bold text-up-strong">
                          Connecté
                        </span>
                      ) : (
                        <button
                          onClick={() => connect(p.id)}
                          className="inline-flex h-9 cursor-pointer items-center rounded-full bg-control px-4 text-[12.5px] font-semibold transition-colors hover:bg-control-hover"
                        >
                          Connecter
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                <div className="mt-[14px] flex items-center gap-3">
                  <button
                    onClick={back}
                    className="inline-flex h-[46px] cursor-pointer items-center rounded-full bg-control px-5 text-[13.5px] font-semibold transition-colors hover:bg-control-hover"
                  >
                    Retour
                  </button>
                  <span className="flex-1" />
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={next}
                    className="inline-flex h-12 cursor-pointer items-center rounded-full bg-accent px-6 text-[14.5px] font-semibold text-white shadow-cta transition-colors hover:bg-accent-press"
                  >
                    Lancer le premier scan
                  </motion.button>
                </div>
              </>
            )}

            {step === 5 &&
              (scan < 100 ? (
                <>
                  <div className="headline text-[28px] text-ink">
                    On établit ta cote…
                  </div>
                  <div className="-mt-2 text-[13.5px] text-body">{scanLabel}</div>
                  <div className="mt-[10px] h-[10px] overflow-hidden rounded-full bg-hairline">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: pct, transition: "width 1s linear" }}
                    />
                  </div>
                  <div className="font-mono text-[13px] text-muted">{pct}</div>
                </>
              ) : (
                <>
                  <div className="mx-auto flex h-14 w-14 animate-card-in items-center justify-center rounded-full bg-accent-tint text-2xl font-bold text-accent-press">
                    ✓
                  </div>
                  <div className="headline text-[28px] text-ink">
                    Ton radar est prêt.
                  </div>
                  <div className="-mt-2 text-[13.5px] text-body">
                    Cote établie sur {picked.length} catégorie(s). Les lots sous la cote
                    apparaissent déjà.
                  </div>
                  <div className="flex flex-wrap justify-center gap-2">
                    {picked.map((c) => (
                      <span
                        key={c.name}
                        className="inline-flex items-center rounded-full bg-accent-tint px-[13px] py-[6px] text-xs font-semibold text-accent-press"
                      >
                        {c.name}
                      </span>
                    ))}
                  </div>
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={finish}
                    disabled={submitting}
                    className="mx-auto mt-2 inline-flex h-[50px] cursor-pointer items-center justify-center rounded-full bg-accent px-7 text-[15px] font-semibold text-white shadow-cta transition-colors hover:bg-accent-press disabled:cursor-not-allowed disabled:bg-accent-disabled"
                  >
                    {submitting ? "Création…" : "Ouvrir le radar"}
                  </motion.button>
                </>
              ))}
          </motion.div>
        </AnimatePresence>
      </div>

      <Toast />
    </div>
  );
}
