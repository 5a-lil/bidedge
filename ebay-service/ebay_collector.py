"""Client eBay officiel — OAuth (client credentials) + Browse API (annonces
actives) + Marketplace Insights API (ventes conclues, 90 j).

Aucune enchère n'est jamais placée ici : uniquement de la lecture via les API
officielles eBay (pas de scraping). Le placement d'enchère reste manuel côté
utilisateur — position produit permanente.
"""

import base64
import os
import time

import requests

BASE_SCOPE = "https://api.ebay.com/oauth/api_scope"
INSIGHTS_SCOPE = "https://api.ebay.com/oauth/api_scope/buy.marketplace.insights"

OAUTH_URL = "https://api.ebay.com/identity/v1/oauth2/token"
BROWSE_SEARCH_URL = "https://api.ebay.com/buy/browse/v1/item_summary/search"
BROWSE_ITEM_URL = "https://api.ebay.com/buy/browse/v1/item/{item_id}"
INSIGHTS_SEARCH_URL = "https://api.ebay.com/buy/marketplace_insights/v1_beta/item_sales/search"


class EbayAuthError(RuntimeError):
    """Identifiants manquants ou refus d'autorisation eBay."""


class EbayCollector:
    def __init__(self):
        self.client_id = os.getenv("EBAY_CLIENT_ID")
        self.client_secret = os.getenv("EBAY_CLIENT_SECRET")
        self.marketplace_id = os.getenv("EBAY_MARKETPLACE_ID", "EBAY_FR")
        self.currency = os.getenv("EBAY_CURRENCY", "EUR")
        # cache des tokens par scope : { scope: (token, expiry_epoch) }
        self._tokens = {}

    def has_credentials(self):
        return bool(self.client_id and self.client_secret)

    # ------------------------------------------------------------------ OAuth
    def _get_token(self, scope=BASE_SCOPE):
        if not self.has_credentials():
            raise EbayAuthError(
                "EBAY_CLIENT_ID / EBAY_CLIENT_SECRET manquants — renseigne ebay-service/.env"
            )
        cached = self._tokens.get(scope)
        if cached and cached[1] - 60 > time.time():
            return cached[0]

        auth = base64.b64encode(f"{self.client_id}:{self.client_secret}".encode()).decode()
        resp = requests.post(
            OAUTH_URL,
            headers={
                "Content-Type": "application/x-www-form-urlencoded",
                "Authorization": f"Basic {auth}",
            },
            data={"grant_type": "client_credentials", "scope": scope},
            timeout=10,
        )
        if resp.status_code != 200:
            raise EbayAuthError(f"Auth eBay échouée ({resp.status_code}): {resp.text[:300]}")
        data = resp.json()
        token = data.get("access_token")
        if not token:
            raise EbayAuthError("Réponse OAuth eBay sans access_token")
        self._tokens[scope] = (token, time.time() + int(data.get("expires_in", 7200)))
        return token

    def _headers(self, scope=BASE_SCOPE):
        return {
            "Authorization": f"Bearer {self._get_token(scope)}",
            "X-EBAY-C-MARKETPLACE-ID": self.marketplace_id,
        }

    # ---------------------------------------------------- Browse : actives
    def get_auctions(self, query, min_price=None, max_price=None, limit=50):
        """Annonces d'enchères ACTIVES pour une requête (Browse API)."""
        filters = ["buyingOptions:{AUCTION}", f"priceCurrency:{self.currency}"]
        if min_price is not None or max_price is not None:
            lo = min_price if min_price is not None else "*"
            hi = max_price if max_price is not None else "*"
            filters.append(f"price:[{lo}..{hi}]")

        all_items = []
        offset = 0
        page = min(200, max(1, limit))
        while len(all_items) < limit:
            params = {"q": query, "limit": page, "offset": offset, "filter": ",".join(filters)}
            resp = requests.get(BROWSE_SEARCH_URL, headers=self._headers(), params=params, timeout=15)
            if resp.status_code != 200:
                raise EbayAuthError(f"Browse search {resp.status_code}: {resp.text[:300]}")
            items = resp.json().get("itemSummaries", []) or []
            if not items:
                break
            all_items.extend(items)
            if len(items) < page:
                break
            offset += page
        return all_items[:limit]

    def get_item(self, item_id):
        """Détail d'un lot (dont l'enchère courante et la date de fin)."""
        resp = requests.get(BROWSE_ITEM_URL.format(item_id=item_id), headers=self._headers(), timeout=15)
        if resp.status_code != 200:
            raise EbayAuthError(f"Browse item {resp.status_code}: {resp.text[:300]}")
        return resp.json()

    def get_active_listings(self, query, min_price=None, max_price=None, limit=100):
        """Annonces ACTIVES tous formats (achat immédiat + enchères) — sert de
        proxy de marché quand l'accès Marketplace Insights (ventes conclues)
        n'est pas disponible."""
        filters = [f"priceCurrency:{self.currency}"]
        if min_price is not None or max_price is not None:
            lo = min_price if min_price is not None else "*"
            hi = max_price if max_price is not None else "*"
            filters.append(f"price:[{lo}..{hi}]")

        all_items = []
        offset = 0
        page = min(200, max(1, limit))
        while len(all_items) < limit:
            params = {"q": query, "limit": page, "offset": offset, "filter": ",".join(filters)}
            resp = requests.get(BROWSE_SEARCH_URL, headers=self._headers(), params=params, timeout=15)
            if resp.status_code != 200:
                raise EbayAuthError(f"Browse search {resp.status_code}: {resp.text[:300]}")
            items = resp.json().get("itemSummaries", []) or []
            if not items:
                break
            all_items.extend(items)
            if len(items) < page:
                break
            offset += page
        return all_items[:limit]

    def listing_prices(self, items):
        """Prix exploitables d'annonces actives : prix affiché (BIN) sinon
        enchère courante."""
        prices = []
        for it in items:
            p = self._price_of(it, "price", "currentBidPrice")
            if p is not None and p > 0:
                prices.append(p)
        return prices

    def listing_samples(self, items, top=6):
        out = []
        for it in items[:top]:
            p = self._price_of(it, "price", "currentBidPrice")
            out.append(
                {
                    "title": it.get("title"),
                    "soldPrice": p,
                    "date": "en cours",
                    "condition": it.get("condition"),
                    "source": "eBay (annonce active)",
                }
            )
        return out

    def market_estimate(self, query, condition_ids=None, days=90, limit=100):
        """Cote du marché : essaie les VENTES CONCLUES (Insights) ; si l'accès
        n'est pas activé, retombe sur la médiane des ANNONCES ACTIVES.

        Renvoie {basis, prices, samples} où basis ∈ {"sold_90d", "active_listings"}.
        """
        try:
            sold = self.get_sold_items(query, condition_ids=condition_ids, days=days, limit=limit)
            prices = self.sold_prices(sold)
            if prices:
                return {"basis": "sold_90d", "prices": prices, "samples": self.sold_samples(sold)}
        except EbayAuthError:
            # accès Insights absent (invalid_scope / 403) → repli annonces actives
            pass
        listings = self.get_active_listings(query, limit=limit)
        return {
            "basis": "active_listings",
            "prices": self.listing_prices(listings),
            "samples": self.listing_samples(listings),
        }

    # -------------------------------------- Marketplace Insights : ventes
    def get_sold_items(self, query, condition_ids=None, days=90, limit=100, category_ids=None):
        """Ventes CONCLUES pour une requête (Marketplace Insights, 90 j max).

        Nécessite un accès eBay approuvé (Application Growth Check) et le scope
        buy.marketplace.insights. Renvoie la liste brute des itemSales.
        """
        filters = [f"priceCurrency:{self.currency}"]
        if condition_ids:
            filters.append("conditionIds:{" + "|".join(str(c) for c in condition_ids) + "}")

        headers = self._headers(INSIGHTS_SCOPE)
        all_sales = []
        offset = 0
        page = min(200, max(1, limit))
        while len(all_sales) < limit:
            params = {"q": query, "limit": page, "offset": offset, "filter": ",".join(filters)}
            if category_ids:
                params["category_ids"] = ",".join(str(c) for c in category_ids)
            resp = requests.get(INSIGHTS_SEARCH_URL, headers=headers, params=params, timeout=20)
            if resp.status_code == 403:
                raise EbayAuthError(
                    "Marketplace Insights refusé (403) — l'accès n'est pas activé sur ce compte eBay. "
                    "Demande l'Application Growth Check, ou utilise la médiane des annonces actives."
                )
            if resp.status_code != 200:
                raise EbayAuthError(f"Insights search {resp.status_code}: {resp.text[:300]}")
            sales = resp.json().get("itemSales", []) or []
            if not sales:
                break
            all_sales.extend(sales)
            if len(sales) < page:
                break
            offset += page
        return all_sales[:limit]

    # ------------------------------------------------------- normalisation
    @staticmethod
    def _price_of(node, *keys):
        """Extrait un prix float depuis une structure {value, currency}."""
        for k in keys:
            v = node.get(k)
            if isinstance(v, dict) and v.get("value") is not None:
                try:
                    return float(v["value"])
                except (TypeError, ValueError):
                    pass
        return None

    def sold_prices(self, sold_items):
        """Liste des prix de vente exploitables (float) depuis les itemSales."""
        prices = []
        for s in sold_items:
            p = self._price_of(s, "lastSoldPrice", "salePrice", "price")
            if p is not None and p > 0:
                prices.append(p)
        return prices

    def sold_samples(self, sold_items, top=6):
        """Échantillons lisibles (titre, prix, date) pour l'affichage/comparables."""
        out = []
        for s in sold_items[:top]:
            p = self._price_of(s, "lastSoldPrice", "salePrice", "price")
            out.append(
                {
                    "title": s.get("title"),
                    "soldPrice": p,
                    "date": (s.get("lastSoldDate") or "")[:10],
                    "condition": s.get("condition"),
                    "source": "eBay",
                }
            )
        return out
