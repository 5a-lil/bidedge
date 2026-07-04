"use client";

// Landing BidEdge — DA « Paper & Ink » : claire, éditoriale, calme.
// Le mockup radar (#demo) tourne en vraie simulation : horloge 58 s,
// enchère +€5 toutes les 7 s, flash « surenchéri », reset en boucle.
import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import ChromeWindow from "@/components/landing/ChromeWindow";
import Reveal from "@/components/landing/Reveal";

const MotionLink = motion.create(Link);

const DUR = 58;

type Sim = { t: number | null; bid: number; bidders: number; flashUntil: number };

// gradients « photo » du mockup
const GRAD_HOT =
  "radial-gradient(120% 90% at 22% 12%,rgba(255,255,255,.18),transparent 46%),linear-gradient(140deg,#353b44,#101318)";
const GRAD_OMEGA =
  "radial-gradient(120% 90% at 22% 12%,rgba(255,255,255,.16),transparent 46%),linear-gradient(140deg,#4a3f33,#171310)";
const GRAD_RTX =
  "radial-gradient(120% 90% at 22% 12%,rgba(255,255,255,.12),transparent 46%),linear-gradient(140deg,#2e2b3d,#131020)";
const GRAD_DIVER = "linear-gradient(140deg,#39404d,#12151b)";

/* ————— petits blocs réutilisés ————— */

function Check({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3 items-start">
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-up-strong flex-none mt-[3px]"
      >
        <path d="M2.5 8.5l3.5 3.5L13.5 4" />
      </svg>
      <span className="text-[14px] leading-[1.55] text-ink">{children}</span>
    </div>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3 items-start">
      <span className="w-2 h-2 rounded-full bg-accent mt-[7px] flex-none" />
      <span className="text-[14px] leading-[1.55] text-ink">{children}</span>
    </div>
  );
}

export default function LandingPage() {
  // ---- taille responsive de la fenêtre navigateur ----
  const [winW, setWinW] = useState(1096);
  useEffect(() => {
    const update = () => setWinW(Math.max(720, Math.min(1096, window.innerWidth - 56)));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // ---- simulation live (mécanique conservée à l'identique) ----
  const [sim, setSim] = useState<Sim>({ t: null, bid: 95, bidders: 6, flashUntil: 0 });
  useEffect(() => {
    const iv = setInterval(() => {
      setSim((s) => {
        let t = (s.t == null ? DUR : s.t) - 1;
        let { bid, bidders, flashUntil } = s;
        if (t <= 0) {
          t = DUR;
          bid = 95;
          bidders = 6;
        } else if (t % 7 === 0 && bid < 165) {
          bid += 5;
          flashUntil = Date.now() + 2400;
          if (t % 14 === 0) bidders += 1;
        }
        return { t, bid, bidders, flashUntil };
      });
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  const tVal = sim.t == null ? DUR : sim.t;
  const sug = sim.bid + 5;
  const mm = Math.floor(tVal / 60);
  const ssStr = String(tVal % 60).padStart(2, "0");
  const edge = (v: number) => "−" + Math.round((1 - v / 280) * 100) + "%";
  const flashOn = Date.now() < sim.flashUntil;
  const tColor = tVal <= 30 ? "#C92F39" : "#16150F";
  const hotBorder = flashOn ? "#C92F39" : "#147879";
  const tTxt = `${mm}:${ssStr}`;
  const bidTxt = `€${sim.bid}`;
  const sugTxt = `€${sug}`;
  const biddersTxt = String(sim.bidders);
  const edgeCurTxt = edge(sim.bid);

  return (
    <div className="bg-app text-ink">
      <style>{`
        html{scroll-behavior:smooth}
        @keyframes flashIn{0%{opacity:0;transform:translateY(-5px)}12%{opacity:1;transform:none}80%{opacity:1}100%{opacity:0}}
      `}</style>

      {/* ================= NAV ================= */}
      <div className="sticky top-0 z-50 bg-white/85 backdrop-blur-[10px] border-b border-hairline">
        <div className="max-w-[1160px] mx-auto px-8 flex items-center gap-7 h-[68px]">
          <Link href="/home" className="font-display text-[21px] font-medium tracking-[-0.01em]">
            Bid<span className="text-accent">Edge</span>
          </Link>
          <span className="w-4" />
          <a href="#produit" className="text-[13.5px] font-medium text-body hover:text-ink transition-colors">
            Produit
          </a>
          <a href="#cote" className="text-[13.5px] font-medium text-body hover:text-ink transition-colors">
            La cote
          </a>
          <a href="#tarifs" className="text-[13.5px] font-medium text-body hover:text-ink transition-colors">
            Tarifs
          </a>
          <span className="flex-1" />
          <Link href="/login" className="text-[13.5px] font-semibold text-ink hover:text-accent-press transition-colors">
            Se connecter
          </Link>
          <MotionLink
            href="/onboarding"
            whileTap={{ scale: 0.97 }}
            className="inline-flex items-center h-10 px-5 rounded-full bg-accent text-white text-[13.5px] font-semibold hover:bg-accent-press transition-colors"
          >
            Commencer
          </MotionLink>
        </div>
      </div>

      {/* ================= HERO ================= */}
      <div
        className="overflow-hidden"
        style={{
          background: "radial-gradient(56% 44% at 50% 0%,rgba(20,120,121,.06),transparent 62%)",
        }}
      >
        <div className="max-w-[1160px] mx-auto px-8 pt-24 pb-16 text-center">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: "easeOut" }}
          >
            <span className="overline inline-flex items-center gap-2.5">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-blink" />
              Copilote d&rsquo;enchères en direct
            </span>
            <h1 className="font-display text-[68px] font-normal tracking-[-0.01em] leading-[1.04] mt-6">
              L&rsquo;avantage,
              <br />
              à chaque enchère.
            </h1>
            <p className="text-[16.5px] leading-[1.65] text-body max-w-[560px] mx-auto mt-6">
              BidEdge scanne les catégories que tu chasses, établit la cote réelle du marché et te
              souffle la bonne enchère — juste au-dessus de l&rsquo;actuelle, jamais au-dessus de ta
              limite. <span className="text-ink font-semibold">Toi, tu tapes.</span>
            </p>
            <div className="flex items-center justify-center gap-3.5 mt-9">
              <MotionLink
                href="/onboarding"
                whileTap={{ scale: 0.97 }}
                className="inline-flex items-center h-[54px] px-8 rounded-full bg-accent text-white text-[15px] font-semibold hover:bg-accent-press transition-colors shadow-cta"
              >
                Commencer gratuitement
              </MotionLink>
              <MotionLink
                href="#demo"
                whileTap={{ scale: 0.97 }}
                className="inline-flex items-center h-[54px] px-7 rounded-full bg-white border border-hairline text-[14.5px] font-semibold hover:border-ink transition-colors"
              >
                Voir la démo&nbsp;↓
              </MotionLink>
            </div>
            <div className="text-[12px] text-muted mt-4">
              Essai Pro <span className="font-mono">14</span> jours · sans carte bancaire · enchères
              via les API officielles
            </div>
          </motion.div>
        </div>

        {/* ================= #DEMO — MOCKUP LIVE ================= */}
        <div className="max-w-[1160px] mx-auto px-8 pb-24">
          <motion.div
            id="demo"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15, ease: "easeOut" }}
            className="flex flex-col items-center gap-4"
            style={{ scrollMarginTop: 90 }}
          >
            <span className="inline-flex items-center gap-2 rounded-full bg-ink text-white text-[11px] font-bold uppercase tracking-[0.08em] px-4 py-2">
              <span className="w-1.5 h-1.5 rounded-full bg-accent-dark animate-blink" />
              Simulation live — l&rsquo;horloge et les enchères tournent vraiment
            </span>
            <div style={{ filter: "drop-shadow(0 48px 90px rgba(22,21,15,.18))" }}>
              <ChromeWindow url="app.bidedge.com/radar" width={winW} height={600}>
                <div className="flex h-full bg-app text-ink text-left text-[14px]">
                  {/* ---- sidebar ---- */}
                  <div className="w-48 flex-none bg-white border-r border-hairline flex flex-col gap-1 px-3 py-4">
                    <span className="font-display text-[16px] font-medium px-2.5 pb-3.5">
                      Bid<span className="text-accent">Edge</span>
                    </span>
                    <span className="flex items-center gap-2.5 px-3 py-2 rounded-full bg-accent-tint text-accent-press text-[12.5px] font-semibold">
                      <span className="w-3.5 h-3.5 rounded-[5px] bg-accent flex-none" />
                      Radar
                      <span className="ml-auto w-1.5 h-1.5 rounded-full bg-accent animate-blink" />
                    </span>
                    <span className="flex items-center gap-2.5 px-3 py-2 rounded-full text-[12.5px] font-medium text-body">
                      <span className="w-3.5 h-3.5 rounded-[5px] bg-control-hover flex-none" />
                      Catégories
                    </span>
                    <span className="flex items-center gap-2.5 px-3 py-2 rounded-full text-[12.5px] font-medium text-body">
                      <span className="w-3.5 h-3.5 rounded-[5px] bg-control-hover flex-none" />
                      Journal
                    </span>
                    <span className="flex-1" />
                    <span className="bg-app border border-hairline rounded-xl px-[11px] py-[9px] flex flex-col gap-[5px]">
                      <span className="flex items-center text-[11px] font-bold">
                        Essai Pro
                        <span className="ml-auto text-[10px] font-medium text-muted">
                          <span className="font-mono">9</span> j restants
                        </span>
                      </span>
                      <span className="h-1 rounded-full bg-control-hover overflow-hidden">
                        <span className="block w-[36%] h-full bg-accent" />
                      </span>
                    </span>
                    <span className="flex items-center gap-[9px] px-2.5 py-2">
                      <span className="w-[26px] h-[26px] rounded-full bg-accent-tint text-accent-press inline-flex items-center justify-center text-[11px] font-bold">
                        M
                      </span>
                      <span className="text-[12px] font-semibold">Manou</span>
                    </span>
                  </div>

                  {/* ---- zone radar ---- */}
                  <div className="flex-1 min-w-0 px-[22px] py-4 overflow-hidden">
                    <div className="flex items-center gap-2.5">
                      <span className="font-display text-[22px] font-medium tracking-[-0.01em]">Radar</span>
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-accent-press bg-accent-tint rounded-full px-2.5 py-1">
                        <span className="w-[5px] h-[5px] rounded-full bg-accent animate-blink" />
                        en direct
                      </span>
                      <span className="flex-1" />
                      <span className="text-[11px] text-muted bg-white border border-hairline rounded-full px-[11px] py-[5px]">
                        Tri : fin imminente ⇅
                      </span>
                    </div>

                    <div className="flex gap-1.5 mt-2.5">
                      <span className="inline-flex rounded-full bg-ink text-white text-[10.5px] font-semibold px-[11px] py-1">
                        Tous · <span className="font-mono">&nbsp;9</span>
                      </span>
                      <span className="inline-flex rounded-full bg-white border border-hairline text-body text-[10.5px] font-medium px-[11px] py-1">
                        Montres · <span className="font-mono">&nbsp;4</span>
                      </span>
                      <span className="inline-flex rounded-full bg-white border border-hairline text-body text-[10.5px] font-medium px-[11px] py-1">
                        RAM · <span className="font-mono">&nbsp;2</span>
                      </span>
                      <span className="inline-flex rounded-full bg-white border border-hairline text-body text-[10.5px] font-medium px-[11px] py-1">
                        GPU · <span className="font-mono">&nbsp;3</span>
                      </span>
                    </div>

                    {/* carte chaude */}
                    <div
                      className="relative bg-white rounded-2xl p-3 flex gap-3 items-center mt-2.5 animate-pulse-teal"
                      style={{ border: `1.5px solid ${hotBorder}` }}
                    >
                      {flashOn && (
                        <span
                          className="absolute -top-[11px] right-3.5 bg-down-tint text-down text-[9.5px] font-bold rounded-full px-2.5 py-1"
                          style={{ border: "1px solid #f0d2d0", animation: "flashIn 2.4s ease both" }}
                        >
                          surenchéri — nouvelle suggestion prête
                        </span>
                      )}
                      <span className="w-[82px] h-[62px] flex-none rounded-[9px]" style={{ background: GRAD_HOT }} />
                      <span className="flex-1 min-w-0 flex flex-col gap-[5px]">
                        <span className="text-[13px] font-semibold">
                          Seiko 6139 chrono 1972{" "}
                          <span className="font-normal text-[10.5px] text-muted">
                            · TokyoTimeShop · Pro · <span className="font-mono">99.2%</span>
                          </span>
                        </span>
                        <span className="flex items-center gap-[7px]">
                          <span className="font-mono font-semibold text-[15px]">{bidTxt}</span>
                          <span className="inline-flex rounded-full bg-up-tint text-up-strong text-[10px] font-bold px-2 py-0.5">
                            <span className="font-mono">{edgeCurTxt}</span>&nbsp;vs cote&nbsp;
                            <span className="font-mono">€240–320</span>
                          </span>
                          <span className="text-[10px] text-muted">
                            <span className="font-mono">{biddersTxt}</span>&nbsp;enchérisseurs
                          </span>
                        </span>
                        <span className="flex items-end gap-0.5 h-[13px]">
                          <span className="w-[5px] h-1 bg-hairline rounded-[2px]" />
                          <span className="w-[5px] h-1.5 bg-hairline rounded-[2px]" />
                          <span className="w-[5px] h-[7px] bg-hairline rounded-[2px]" />
                          <span className="w-[5px] h-[9px] bg-[#a9c6c2] rounded-[2px]" />
                          <span className="w-[5px] h-[13px] bg-accent rounded-[2px]" />
                          <span className="text-[9px] text-muted ml-[5px]">
                            <span className="font-mono">10</span> dern. min
                          </span>
                        </span>
                      </span>
                      <span className="flex-none flex flex-col items-end gap-1.5">
                        <span className="font-mono font-semibold text-[19px]" style={{ color: tColor }}>
                          {tTxt}
                        </span>
                        <span className="inline-flex items-center h-[34px] px-[15px] rounded-full bg-accent text-white text-[11.5px] font-semibold shadow-cta">
                          Voir la suggestion ·&nbsp;<span className="font-mono">{sugTxt}</span>
                        </span>
                      </span>
                    </div>

                    {/* grille 3 colonnes */}
                    <div className="grid grid-cols-3 gap-2.5 mt-2.5">
                      <div className="bg-white rounded-xl border border-hairline p-2.5 flex flex-col gap-1.5 shadow-card">
                        <span className="h-[50px] rounded-lg" style={{ background: GRAD_OMEGA }} />
                        <span className="text-[11.5px] font-semibold">Omega Seamaster 1968</span>
                        <span className="flex justify-between items-baseline">
                          <span className="font-mono font-semibold text-[12px]">
                            €410 <span className="font-medium text-[10px] text-up-strong">−18%</span>
                          </span>
                          <span className="font-mono text-[10px] text-muted">24:10</span>
                        </span>
                      </div>
                      <div className="bg-white rounded-xl border border-hairline p-2.5 flex flex-col gap-1.5 shadow-card">
                        <span className="h-[50px] rounded-lg" style={{ background: GRAD_RTX }} />
                        <span className="text-[11.5px] font-semibold">RTX 4090 Founders</span>
                        <span className="flex justify-between items-baseline">
                          <span className="font-mono font-semibold text-[12px]">
                            €520 <span className="font-medium text-[10px] text-up-strong">−33%</span>
                          </span>
                          <span className="font-mono text-[10px] text-muted">51:02</span>
                        </span>
                      </div>
                      <div
                        className="border-[1.5px] border-dashed rounded-xl p-2.5 flex gap-[9px] items-center bg-white/60"
                        style={{ borderColor: "#d9d5cb" }}
                      >
                        <span className="w-9 h-9 flex-none rounded-lg" style={{ background: GRAD_DIVER }} />
                        <span className="flex-1 min-w-0 flex flex-col">
                          <span className="text-[11px] font-semibold">Seiko 6105 diver</span>
                          <span className="text-[9.5px] text-muted">
                            trouvé par le scan · cote <span className="font-mono">€600+</span>
                          </span>
                        </span>
                        <span className="border-[1.5px] border-accent text-accent-press rounded-full px-2.5 py-1 text-[10px] font-bold">
                          + Suivre
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </ChromeWindow>
            </div>
          </motion.div>
        </div>
      </div>

      {/* ================= TROIS GESTES ================= */}
      <div id="produit" className="bg-white border-t border-hairline" style={{ scrollMarginTop: 68 }}>
        <div className="max-w-[1160px] mx-auto px-8 py-28">
          <Reveal>
            <span className="overline">Comment ça marche</span>
            <h2 className="font-display text-[42px] font-normal tracking-[-0.01em] leading-[1.08] mt-4 max-w-[560px]">
              Trois gestes. Le troisième est le tien.
            </h2>
          </Reveal>
          <div className="grid grid-cols-3 gap-6 mt-12">
            <Reveal delay={0}>
              <motion.div
                whileHover={{ y: -2 }}
                className="h-full bg-app border border-hairline rounded-3xl p-8 flex flex-col gap-3.5 shadow-card transition-shadow hover:shadow-lift"
              >
                <span className="font-mono font-semibold text-[14px] text-accent">01</span>
                <span className="font-display text-[20px] font-medium tracking-[-0.01em]">Dis quoi chasser</span>
                <span className="text-[14px] leading-[1.6] text-body">
                  « Montres Seiko vintage », « RAM DDR5 », « GPU ». Une phrase suffit — le scan
                  démarre.
                </span>
                <div className="flex gap-[7px] flex-wrap mt-1">
                  <span className="inline-flex rounded-full bg-accent-tint text-accent-press text-[11.5px] font-semibold px-3 py-[5px]">
                    Montres Seiko
                  </span>
                  <span className="inline-flex rounded-full bg-accent-tint text-accent-press text-[11.5px] font-semibold px-3 py-[5px]">
                    RAM DDR5
                  </span>
                  <span className="inline-flex rounded-full bg-accent-tint text-accent-press text-[11.5px] font-semibold px-3 py-[5px]">
                    GPU
                  </span>
                </div>
              </motion.div>
            </Reveal>
            <Reveal delay={0.08}>
              <motion.div
                whileHover={{ y: -2 }}
                className="h-full bg-app border border-hairline rounded-3xl p-8 flex flex-col gap-3.5 shadow-card transition-shadow hover:shadow-lift"
              >
                <span className="font-mono font-semibold text-[14px] text-accent">02</span>
                <span className="font-display text-[20px] font-medium tracking-[-0.01em]">On établit la cote</span>
                <span className="text-[14px] leading-[1.6] text-body">
                  Ventes passées réelles + recherche live, sources citées. Chaque lot du radar sait
                  ce qu&rsquo;il vaut.
                </span>
                <div className="relative h-[26px] mt-1">
                  <div className="absolute left-0 right-0 top-[9px] h-2 bg-control rounded-full" />
                  <div
                    className="absolute top-[9px] h-2 rounded-full"
                    style={{
                      left: "30%",
                      width: "46%",
                      background:
                        "linear-gradient(90deg,rgba(20,120,121,.3),#147879 45%,rgba(20,120,121,.3))",
                    }}
                  />
                  <div className="absolute left-[52%] top-[5px] w-0.5 h-4 bg-accent-press" />
                  <span className="absolute left-[52%] -translate-x-1/2 -top-2 font-mono text-[10px] text-accent-press">
                    €280
                  </span>
                </div>
              </motion.div>
            </Reveal>
            <Reveal delay={0.16}>
              <motion.div
                whileHover={{ y: -2 }}
                className="h-full bg-app border border-hairline rounded-3xl p-8 flex flex-col gap-3.5 shadow-card transition-shadow hover:shadow-lift"
              >
                <span className="font-mono font-semibold text-[14px] text-accent">03</span>
                <span className="font-display text-[20px] font-medium tracking-[-0.01em]">
                  Tu enchéris d&rsquo;un tap
                </span>
                <span className="text-[14px] leading-[1.6] text-body">
                  Au bon moment, la bonne enchère — juste au-dessus de l&rsquo;actuelle. Surenchéri ?
                  On te repropose.
                </span>
                <span className="inline-flex items-center justify-center h-10 rounded-full bg-accent text-white text-[13px] font-semibold shadow-cta mt-1">
                  Enchérir&nbsp;<span className="font-mono">€100</span>&nbsp;maintenant
                </span>
              </motion.div>
            </Reveal>
          </div>
        </div>
      </div>

      {/* ================= LA COTE ================= */}
      <div id="cote" className="bg-app" style={{ scrollMarginTop: 68 }}>
        <div className="max-w-[1160px] mx-auto px-8 py-28 flex gap-14 items-center">
          <Reveal className="flex-1 min-w-0">
            <span className="overline">La méthode</span>
            <h2 className="font-display text-[42px] font-normal tracking-[-0.01em] leading-[1.1] mt-4">
              La cote, pas du bruit.
            </h2>
            <p className="text-[15px] leading-[1.65] text-body mt-4 max-w-[420px]">
              Pas de « score IA » opaque. Une fourchette de prix construite sur des ventes réelles,
              que tu peux vérifier ligne par ligne.
            </p>
            <div className="flex flex-col gap-3.5 mt-7">
              <Bullet>
                <b>Ventes passées réelles</b> — <span className="font-mono">124</span> transactions
                comparées pour une catégorie type, sources citées.
              </Bullet>
              <Bullet>
                <b>Recherche live</b> — les annonces en cours ajustent la fourchette en continu.
              </Bullet>
              <Bullet>
                <b>Sous-modèles distingués</b> — un 6139 « Pepsi » ne vaut pas un cadran abîmé, et la
                cote le sait.
              </Bullet>
            </div>
          </Reveal>
          <Reveal delay={0.1} className="flex-1 min-w-0">
            <motion.div
              whileHover={{ y: -2 }}
              className="bg-white border border-hairline rounded-3xl p-8 shadow-card transition-shadow hover:shadow-lift"
            >
              <div className="flex items-center gap-2.5">
                <span className="text-[14.5px] font-semibold">Montres Seiko vintage</span>
                <span className="inline-flex rounded-full bg-accent-tint text-accent-press text-[11px] font-bold px-[11px] py-1">
                  Cote établie
                </span>
                <span className="ml-auto text-[11.5px] text-muted">
                  <span className="font-mono">124</span> ventes · <span className="font-mono">3</span> sources
                </span>
              </div>
              {/* bande de cote signature */}
              <div className="relative h-[70px] mt-6">
                <span className="absolute left-[26%] -translate-x-1/2 top-5 font-mono text-[13px] font-medium">
                  €180
                </span>
                <span className="absolute left-[46%] -translate-x-1/2 top-0 text-center leading-[1.05]">
                  <span className="font-mono text-[20px] font-semibold text-accent-press">€280</span>
                  <br />
                  <span className="overline !text-[9px]">médiane</span>
                </span>
                <span className="absolute left-[74%] -translate-x-1/2 top-5 font-mono text-[13px] font-medium">
                  €420
                </span>
                <div className="absolute left-0 right-0 top-[50px] h-3.5 bg-control rounded-full" />
                <div
                  className="absolute top-[50px] h-3.5 rounded-full"
                  style={{
                    left: "26%",
                    width: "48%",
                    background:
                      "linear-gradient(90deg,rgba(20,120,121,.3),#147879 42%,rgba(20,120,121,.3))",
                  }}
                />
                <div className="absolute left-[46%] top-[44px] w-[2.5px] h-[26px] bg-accent-press rounded-[2px]" />
              </div>
              {/* pin lot live */}
              <div className="relative h-14">
                <div className="absolute left-[9%] top-0 w-0.5 h-4 bg-accent" />
                <div className="absolute left-[9%] top-[13px] w-[13px] h-[13px] rounded-full bg-accent border-[2.5px] border-white shadow-[0_1px_4px_rgba(22,21,15,0.25)] -translate-x-[45%]" />
                <span className="absolute left-[3%] top-[34px] text-[11px] font-semibold whitespace-nowrap">
                  Seiko 6139 · live <span className="font-mono">€95</span>
                </span>
                <span
                  className="absolute left-[13.5%] w-[11.5%] top-[19px]"
                  style={{ borderTop: "1.5px dashed rgba(20,120,121,.6)" }}
                />
                <span className="absolute left-[25%] top-[13px] text-[10px]" style={{ color: "rgba(20,120,121,.85)" }}>
                  ›
                </span>
                <span className="absolute left-[26.8%] top-2 inline-flex items-center rounded-full bg-up-tint text-up-strong px-[11px] py-[3px] text-[11.5px] font-bold">
                  ton edge · <span className="font-mono">&nbsp;−62%</span>
                </span>
              </div>
              <div className="text-[11px] text-muted mt-1.5">
                la zone teal = ce que le marché paie · le point = le lot en direct
              </div>
            </motion.div>
          </Reveal>
        </div>
      </div>

      {/* ================= JAMAIS D'AUTOBID ================= */}
      <div className="bg-white border-t border-hairline">
        <div className="max-w-[1160px] mx-auto px-8 py-28 flex gap-14 items-center">
          <Reveal className="flex-1 min-w-0">
            <div className="bg-dark-card border border-dark-border rounded-3xl p-9 text-white shadow-pop">
              <span className="overline !text-dark-text">Réglages · garde-fous</span>
              <div className="flex justify-between items-center gap-3.5 mt-5">
                <span className="flex flex-col gap-1">
                  <span className="text-[15px] font-semibold">
                    Confirmation humaine avant chaque enchère
                  </span>
                  <span className="text-[12.5px] text-dark-text">Ce garde-fou est permanent.</span>
                </span>
                <span className="flex items-center gap-2.5 flex-none">
                  <span className="inline-flex rounded-full bg-[rgba(63,182,183,0.14)] text-accent-dark2 text-[10.5px] font-bold px-[11px] py-1">
                    toujours actif
                  </span>
                  {/* toggle verrouillé */}
                  <span className="w-[38px] h-[22px] rounded-full bg-accent relative cursor-not-allowed">
                    <span className="absolute top-0.5 left-[18px] w-[18px] h-[18px] rounded-full bg-white" />
                  </span>
                </span>
              </div>
              <div className="h-px bg-dark-border my-5" />
              <div className="text-[13px] leading-[1.65] text-dark-text">
                Un bot qui enchérit à ta place finit toujours par acheter ce que tu ne voulais pas,
                au prix que tu ne voulais pas. BidEdge prépare la décision —{" "}
                <span className="text-white font-semibold">la main, c&rsquo;est la tienne.</span>
              </div>
            </div>
          </Reveal>
          <Reveal delay={0.1} className="flex-1 min-w-0">
            <span className="overline">Position produit</span>
            <h2 className="font-display text-[42px] font-normal tracking-[-0.01em] leading-[1.1] mt-4">
              Jamais d&rsquo;autobid.
            </h2>
            <p className="text-[15px] leading-[1.65] text-body mt-4 max-w-[420px]">
              C&rsquo;est une position produit, pas une limitation. Chaque enchère part de ton doigt,
              sous ta limite, dans ton budget.
            </p>
            <div className="flex flex-col gap-3 mt-6">
              <Check>Enchères via les API officielles des plateformes</Check>
              <Check>Budget mensuel et limite par lot, fixés à froid</Check>
              <Check>Journal de décisions — tes choix nourrissent les suggestions suivantes</Check>
            </div>
          </Reveal>
        </div>
      </div>

      {/* ================= TARIFS ================= */}
      <div id="tarifs" className="bg-app" style={{ scrollMarginTop: 68 }}>
        <div className="max-w-[1160px] mx-auto px-8 py-28">
          <Reveal>
            <h2 className="font-display text-[42px] font-normal tracking-[-0.01em] text-center m-0">
              Un prix simple.
            </h2>
            <div className="text-[14px] text-body text-center mt-2.5">
              Essai Pro <span className="font-mono">14</span> jours. Sans engagement, sans carte.
            </div>
          </Reveal>
          <div className="grid grid-cols-3 gap-6 mt-12 items-stretch">
            <Reveal delay={0}>
              <motion.div
                whileHover={{ y: -2 }}
                className="h-full bg-white border border-hairline rounded-3xl p-8 flex flex-col gap-4 shadow-card transition-shadow hover:shadow-lift"
              >
                <span className="text-[15px] font-semibold">Chasseur</span>
                <div>
                  <span className="font-mono font-semibold text-[34px]">€0</span>
                  <span className="text-[13px] text-muted"> /mois</span>
                </div>
                <div className="h-px bg-hairline" />
                <div className="flex flex-col gap-2.5 text-[13.5px] flex-1">
                  <span>· <span className="font-mono">1</span> catégorie scannée</span>
                  <span>· Cote rafraîchie chaque semaine</span>
                  <span>· <span className="font-mono">3</span> alertes par mois</span>
                </div>
                <MotionLink
                  href="/onboarding"
                  whileTap={{ scale: 0.97 }}
                  className="flex items-center justify-center h-11 rounded-full bg-control hover:bg-control-hover transition-colors text-[13.5px] font-semibold"
                >
                  Commencer
                </MotionLink>
              </motion.div>
            </Reveal>
            <Reveal delay={0.08}>
              <motion.div
                whileHover={{ y: -2 }}
                className="h-full bg-ink text-white rounded-3xl p-8 flex flex-col gap-4 shadow-pop"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-[15px] font-semibold">Pro</span>
                  <span className="inline-flex rounded-full bg-[rgba(63,182,183,0.14)] text-accent-dark2 text-[10.5px] font-bold px-[11px] py-1">
                    recommandé
                  </span>
                </div>
                <div>
                  <span className="font-mono font-semibold text-[34px]">€19</span>
                  <span className="text-[13px] text-dark-text"> /mois</span>
                </div>
                <div className="h-px bg-dark-border" />
                <div className="flex flex-col gap-2.5 text-[13.5px] text-[#eae8e1] flex-1">
                  <span>· Catégories illimitées</span>
                  <span>· Cote en temps réel + sous-modèles</span>
                  <span>· Suggestions d&rsquo;enchères en direct</span>
                  <span>· Journal &amp; mémoire de tes décisions</span>
                </div>
                <MotionLink
                  href="/onboarding"
                  whileTap={{ scale: 0.97 }}
                  className="flex items-center justify-center h-11 rounded-full bg-accent hover:bg-accent-press transition-colors text-white text-[13.5px] font-semibold"
                >
                  Essayer <span className="font-mono">&nbsp;14&nbsp;</span> jours
                </MotionLink>
              </motion.div>
            </Reveal>
            <Reveal delay={0.16}>
              <motion.div
                whileHover={{ y: -2 }}
                className="h-full bg-white border border-hairline rounded-3xl p-8 flex flex-col gap-4 shadow-card transition-shadow hover:shadow-lift"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-[15px] font-semibold">Équipe</span>
                  <span className="inline-flex rounded-full bg-control text-body text-[10.5px] font-bold px-[11px] py-1">
                    pour les crews
                  </span>
                </div>
                <div>
                  <span className="font-mono font-semibold text-[34px]">€49</span>
                  <span className="text-[13px] text-muted"> /mois</span>
                </div>
                <div className="h-px bg-hairline" />
                <div className="flex flex-col gap-2.5 text-[13.5px] flex-1">
                  <span>· Tout Pro</span>
                  <span>· Organisation : rôles &amp; membres</span>
                  <span>· Budget partagé, plafonds d&rsquo;équipe</span>
                  <span>· Radar et catégories partagés</span>
                </div>
                <MotionLink
                  href="/onboarding"
                  whileTap={{ scale: 0.97 }}
                  className="flex items-center justify-center h-11 rounded-full bg-control hover:bg-control-hover transition-colors text-[13.5px] font-semibold"
                >
                  Contacter l&rsquo;équipe
                </MotionLink>
              </motion.div>
            </Reveal>
          </div>
        </div>
      </div>

      {/* ================= FAQ ================= */}
      <div className="bg-white border-t border-hairline">
        <div className="max-w-[1160px] mx-auto px-8 py-28">
          <Reveal>
            <span className="overline">FAQ</span>
            <h2 className="font-display text-[36px] font-normal tracking-[-0.01em] mt-4 mb-10">
              Questions directes, réponses directes.
            </h2>
          </Reveal>
          <Reveal delay={0.08}>
            <div className="grid grid-cols-2 gap-y-8 gap-x-14">
              <div className="flex flex-col gap-2">
                <span className="text-[15.5px] font-semibold">C&rsquo;est un bot d&rsquo;enchères ?</span>
                <span className="text-[14px] leading-[1.6] text-body">
                  Non, et ça ne le sera jamais. BidEdge ne place aucune enchère seul — il prépare la
                  décision, tu la prends. La confirmation humaine est un garde-fou permanent, pas une
                  option.
                </span>
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-[15.5px] font-semibold">Quelles plateformes ?</span>
                <span className="text-[14px] leading-[1.6] text-body">
                  eBay, Catawiki et Drouot au lancement, via leurs API officielles. Sans connexion,
                  BidEdge reste ton copilote : il suggère, tu places l&rsquo;enchère sur la
                  plateforme.
                </span>
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-[15.5px] font-semibold">D&rsquo;où vient la cote ?</span>
                <span className="text-[14px] leading-[1.6] text-body">
                  Des ventes réellement conclues, complétées par une recherche live des annonces en
                  cours. Chaque fourchette est traçable — tu peux ouvrir les ventes comparables ligne
                  par ligne.
                </span>
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-[15.5px] font-semibold">Et si je me fais surenchérir ?</span>
                <span className="text-[14px] leading-[1.6] text-body">
                  Nouvelle suggestion immédiate, tant que ça reste sous ta limite. Au-delà, BidEdge te
                  dira de lâcher — perdre une enchère au-dessus de la cote, c&rsquo;est gagner.
                </span>
              </div>
            </div>
          </Reveal>
        </div>
      </div>

      {/* ================= CTA FINAL ================= */}
      <div
        className="bg-ink text-white"
        style={{
          background: "radial-gradient(50% 60% at 50% 100%,rgba(63,182,183,.1),transparent 65%),#16150f",
        }}
      >
        <div className="max-w-[1160px] mx-auto px-8 py-28 text-center">
          <Reveal>
            <h2 className="font-display text-[44px] font-normal tracking-[-0.01em] leading-[1.08] m-0">
              Arrête de perdre des enchères gagnables.
            </h2>
            <div className="text-[15px] text-dark-text mt-3.5">
              Ton premier scan prend <span className="font-mono">2</span> minutes.
            </div>
            <div className="flex justify-center gap-3.5 mt-8">
              <MotionLink
                href="/onboarding"
                whileTap={{ scale: 0.97 }}
                className="inline-flex items-center h-[54px] px-8 rounded-full bg-accent hover:bg-accent-press transition-colors text-white text-[15px] font-semibold shadow-cta"
              >
                Commencer gratuitement
              </MotionLink>
              <MotionLink
                href="/login"
                whileTap={{ scale: 0.97 }}
                className="inline-flex items-center h-[54px] px-7 rounded-full border border-dark-border hover:border-white transition-colors text-white text-[14.5px] font-semibold"
              >
                Se connecter
              </MotionLink>
            </div>
          </Reveal>
        </div>
      </div>

      {/* ================= FOOTER ================= */}
      <div className="bg-white border-t border-hairline">
        <div className="max-w-[1160px] mx-auto px-8 pt-14 pb-7">
          <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-8">
            <div className="flex flex-col gap-3">
              <span className="font-display text-[19px] font-medium tracking-[-0.01em]">
                Bid<span className="text-accent">Edge</span>
              </span>
              <span className="text-[12.5px] leading-[1.6] text-body max-w-[260px]">
                Le copilote des enchères en direct. La cote du marché, la bonne enchère, ta main.
              </span>
            </div>
            <div className="flex flex-col gap-2.5 text-[13px] text-body">
              <span className="overline !text-ink">Produit</span>
              <a href="#demo" className="hover:text-ink transition-colors">
                Démo live
              </a>
              <a href="#produit" className="hover:text-ink transition-colors">
                Comment ça marche
              </a>
              <a href="#cote" className="hover:text-ink transition-colors">
                La cote
              </a>
              <a href="#tarifs" className="hover:text-ink transition-colors">
                Tarifs
              </a>
            </div>
            <div className="flex flex-col gap-2.5 text-[13px] text-body">
              <span className="overline !text-ink">Ressources</span>
              <span className="hover:text-ink transition-colors cursor-pointer">Guide du chasseur</span>
              <span className="hover:text-ink transition-colors cursor-pointer">Statut du service</span>
              <span className="hover:text-ink transition-colors cursor-pointer">Changelog</span>
            </div>
            <div className="flex flex-col gap-2.5 text-[13px] text-body">
              <span className="overline !text-ink">Compte</span>
              <Link href="/login" className="hover:text-ink transition-colors">
                Se connecter
              </Link>
              <Link href="/onboarding" className="hover:text-ink transition-colors">
                Créer un compte
              </Link>
            </div>
          </div>
          <div className="h-px bg-hairline mt-9 mb-5" />
          <div className="flex items-center gap-4 text-[12px] text-muted">
            <span>© <span className="font-mono">2026</span> BidEdge</span>
            <span>Confidentialité</span>
            <span>CGU</span>
            <span className="flex-1" />
            <span>Les enchères passent par les API officielles des plateformes — jamais par scraping.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
