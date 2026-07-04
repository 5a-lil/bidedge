# ebay-service — API données eBay pour BidEdge

Micro-service Flask qui expose les **API officielles eBay** (Browse pour les
enchères actives, Marketplace Insights pour les ventes conclues) au front
Next.js. Lecture seule : **aucune enchère n'est jamais placée** (position produit
permanente — l'humain enchérit lui-même sur eBay).

## Démarrer

```bash
cd ebay-service
python -m venv .venv
# Windows : .venv\Scripts\activate   |  macOS/Linux : source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # puis renseigne EBAY_CLIENT_ID / EBAY_CLIENT_SECRET
python app.py               # http://localhost:5000
```

Côté Next.js, pointe `EBAY_API_URL=http://localhost:5000` dans `.env.local`.

## Endpoints

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/health` | état + présence des identifiants |
| GET | `/auctions?q=&min_price=&max_price=&limit=` | enchères **actives** (Browse) |
| GET | `/item/<item_id>` | détail d'un lot (enchère courante, date de fin) |
| GET | `/market/median?q=&days=&condition_ids=` | **cote** = médiane des ventes conclues (Insights) |
| GET | `/market/evaluate?q=&current_price=&target_margin=&fees_rate=` | **pré-filtre** de rentabilité |

## Le pré-filtre (`/market/evaluate`)

Établit la médiane des ventes conclues, puis :

- `max_profitable_bid = médiane × (1 − marge) − frais`
- `worth_bidding` = le prix courant est ≤ `max_profitable_bid`
- `is_below_market` = le prix courant est < médiane
- `edge_pct` = écart vs médiane (négatif = sous le marché)

Idée : n'appeler l'IA sur le **contexte** d'un article (état, photos, vendeur…)
que lorsque `worth_bidding` est vrai — donc seulement quand c'est déjà sous les
prix du marché. C'est là que se branchera le code de médiane/estimation à venir.

## Accès Marketplace Insights

`/market/median` et `/market/evaluate` utilisent l'API **Marketplace Insights**
(ventes conclues, 90 j), qui nécessite un **accès approuvé par eBay**
(Application Growth Check) et le scope `buy.marketplace.insights`. Sans cet accès,
ces deux routes renvoient `503` avec un message clair (`/auctions` et `/item`
fonctionnent avec de simples clés production). En attendant l'accès, on peut
approximer la cote avec la médiane des **annonces actives** (`/auctions`).
