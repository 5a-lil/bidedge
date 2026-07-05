# BidEdge — le copilote de la chasse aux enchères

> Les chineurs sérieux suivent des dizaines de lots en parallèle sur eBay. Pendant une vente, un lot s'emballe en quelques secondes : les comparables sont éparpillés dans dix onglets, l'état réel est ambigu, et il faut décider d'un plafond *maintenant*, sous le marteau. **BidEdge** est le copilote de ce moment : quand un lot chauffe, il réunit tout ce qu'il faut pour décider — cote issue des ventes conclues, verdict IA sur le contexte du lot, edge vs marché, plafond conseillé — en un seul écran calme. Les agents préparent et conseillent ; **c'est l'humain qui enchérit.**

**RAISE Summit Hackathon 2026 · piste Cursor** — produit issu d'un vrai besoin quotidien (le porteur est chineur).

---

## Garde-fous produit (non négociables)

1. **Human-in-the-loop.** Aucune enchère automatique, aucun scraping des plateformes. BidEdge lit les **API officielles eBay** et conseille ; **l'humain place chaque enchère** lui-même. La confirmation humaine est un invariant, jamais un réglage désactivable.
2. **Pas un dashboard.** Le produit, c'est l'advisory + la décision. Les métriques n'apparaissent que pour justifier *la* décision à l'écran.

## Ce que fait BidEdge

- **Radar** — les lots suivis, avec le lot chaud qui passe au premier plan.
- **Monitoring d'un produit** (`/api/monitor`) — enchères actives eBay sur une fenêtre de clôture, filtrées par IA, avec cote (médiane des ventes conclues), edge et « sous le marché » lot par lot.
- **Cote de marché** — médiane des ventes conclues via l'API eBay *Marketplace Insights*.
- **Verdict IA du lot** (`/api/lot/analyze`) — analyse du **contexte** (état réel, red flags, prix max conseillé) via Gemini. Appelée uniquement sur les lots déjà sous la cote (pré-filtre de rentabilité).
- **Filtre de recherche en langage naturel** — Gemini transforme « iphone 17 » en plan de recherche eBay propre (exclusion des accessoires, bornes de prix, états).
- **Journal & mémoire de goût** — chaque décision est enregistrée et re-citée dans les advisories suivants (`learnsFrom`).
- **SaaS multitenant** — organisations, rôles (owner / enchérisseur / observateur), budget partagé, plafonds d'équipe.
- **Panel super-admin** (`/admin`) — gestion des orgs, plans, statuts d'abonnement et journal d'audit.
- **i18n** — anglais / français (par cookie, défaut : anglais).

## Stack

| Couche | Techno |
|---|---|
| App & UI | Next.js 15 (App Router) · React 19 · TypeScript strict · Tailwind v4 · Framer Motion (`motion/react`) · Zustand · Lenis |
| API | Route Handlers Next.js · SSE (temps réel) |
| Auth | Maison — bcrypt + JWT (`jose`), session en cookie, middleware de protection |
| Base de données | Neon (PostgreSQL) · Drizzle ORM — multitenant, isolation par `org_id` |
| Données enchères | `ebay-service` (Flask) → API officielles eBay *Browse* + *Marketplace Insights* |
| IA | Google Gemini (filtre de recherche + verdict de contexte du lot) |

## Architecture

```
┌──────────────────────────────┐        ┌──────────────────────────────┐
│   Next.js (app + API + DB)    │        │  ebay-service (Flask, Python)│
│                              │  HTTP  │                              │
│  /radar /monitor /lot ...    │ ─────► │  /auctions      (Browse)     │
│  auth · orgs · journal       │        │  /market/median (Insights)   │
│  Neon + Drizzle (multitenant)│        │  filtre + verdict Gemini     │
└──────────────────────────────┘        └───────────────┬──────────────┘
                                                         │  API officielles
                                                         ▼
                                                   eBay  ·  Gemini
```

- `app/(app)/` — l'app connectée : radar `/`, `/categories`, `/lot/[id]`, `/journal`, `/reglages`, `/organisation`
- `app/(marketing)/home` — landing · `app/login`, `app/onboarding` · `app/admin` — panel super-admin
- `app/api/` — `auth/*`, `feed` (SSE), `bid`, `advisory/[lotId]`, `monitor` + `monitor/stream`, `lot/analyze`, `market/evaluate`, `scan`, `org/*`, `admin/orgs/*`
- `lib/db/` — schéma Drizzle, client, seed · `lib/auth/` — sessions, gardes, mots de passe
- `lib/platforms/` — `PlatformAdapter` + adapter eBay (les stubs catawiki/drouot = swap post-hackathon)
- `lib/simulator/` — moteur en mémoire (lot chaud, surenchère) pour la démo hors-ligne
- `lib/taste/` — journal → `learnsFrom` · `lib/i18n/` — messages en/fr · `lib/billing/` — catalogue de plans
- `ebay-service/` — micro-service Flask (voir son [README](ebay-service/README.md))

## Démarrage

### 1. L'app Next.js

```bash
npm install
cp .env.example .env.local        # renseigne les variables ci-dessous
npm run db:push                   # applique le schéma sur Neon
npm run db:seed                   # crée le super-admin + l'org de démo "Team RAISE"
npm run dev                       # http://localhost:3000
```

Variables `.env.local` :

| Variable | Rôle |
|---|---|
| `DATABASE_URL` | Neon PostgreSQL (pooled) — runtime |
| `DIRECT_URL` | Neon (connexion directe) — migrations & seed |
| `AUTH_SECRET` | secret de signature des sessions JWT |
| `EBAY_API_URL` | URL du micro-service eBay (ex. `http://localhost:5000`) |

### 2. Le micro-service eBay (données réelles + IA)

```bash
cd ebay-service
python -m venv .venv
# Windows : .venv\Scripts\activate   |   macOS/Linux : source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env               # EBAY_CLIENT_ID / EBAY_CLIENT_SECRET / GEMINI_API_KEY
python app.py                      # http://localhost:5000
```

Variables clés : `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, `EBAY_MARKETPLACE_ID` (défaut `EBAY_FR`), `EBAY_CURRENCY`, `GEMINI_API_KEY`, `GEMINI_MODEL`. Détails et endpoints dans [ebay-service/README.md](ebay-service/README.md).

> Sans le micro-service ni les clés, l'app reste démontrable : le simulateur en mémoire (`lib/simulator`) et les adapters mockés (`lib/platforms/mock.ts`) alimentent le parcours.

## Comptes de démo (après `npm run db:seed`)

| Compte | Email | Mot de passe | Rôle |
|---|---|---|---|
| Super-admin plateforme | `admin@bidedge.app` | `bidedge-admin` | accès `/admin` |
| Owner (org *Team RAISE*, Pro en essai) | `manou@bidedge.app` | `bidedge-demo` | owner |
| Enchérisseurs | `lex@bidedge.app`, `sam@bidedge.app` | `bidedge-demo` | enchérisseur |
| Observateurs | `nina@bidedge.app`, `ty@bidedge.app` | `bidedge-demo` | observateur |

## Scripts npm

| Script | Rôle |
|---|---|
| `npm run dev` | serveur de dev |
| `npm run build` / `npm start` | build de prod / lancement |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:push` | applique le schéma Drizzle sur Neon |
| `npm run db:studio` | Drizzle Studio |
| `npm run db:seed` | seed idempotent (super-admin + org de démo) |

## Plans

| Plan | Prix | En bref |
|---|---|---|
| **Hunter** | Gratuit | 1 catégorie, cote hebdo, 3 alertes/mois |
| **Pro** | 19 €/mois | catégories illimitées, cote temps réel, suggestions live, journal |
| **Team** | 49 €/mois | organisation, rôles & membres, budget et plafonds partagés |

## Conformité (piste hackathon)

- Dépôt **public** · tout construit pendant l'événement.
- **Human-in-the-loop uniquement** — aucun bot d'enchère, aucun scraping des plateformes réelles.
- Le produit = l'advisory + le tap humain, **pas** un dashboard.
