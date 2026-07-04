"""Live asking-price signal via the official eBay Browse API.

Sold/completed prices are NOT available with a standard eBay key (the old
findCompletedItems call is decommissioned; Marketplace Insights is
partner-restricted). What we CAN get legally is the ACTIVE listings and their
current asking / current-bid prices — a secondary market signal, always
labelled as asking prices, never as realized sales.

Auth is the OAuth2 client-credentials flow (application token), so only
EBAY_CLIENT_ID + EBAY_CLIENT_SECRET are needed — no user login.

Resilience contract (same as exa_client):
- Missing credentials -> returns [] (caller falls back to seed + DB).
- Timeout / HTTP error / malformed response -> returns [] (never raises).
- Token and per-query results are cached in memory.
"""
from __future__ import annotations

import base64
import os
import time

import requests

_TOKEN_URL = "https://api.ebay.com/identity/v1/oauth2/token"
_SEARCH_URL = "https://api.ebay.com/buy/browse/v1/item_summary/search"
_MARKETPLACE = os.environ.get("EBAY_MARKETPLACE_ID", "EBAY_FR")
_TIMEOUT_SEC = 2.5

_token: dict = {"value": None, "expires_at": 0.0}
_cache: dict[str, list[dict]] = {}


def _get_token() -> str | None:
    """Fetch (and cache) an application access token, or None on any failure."""
    client_id = os.environ.get("EBAY_CLIENT_ID")
    client_secret = os.environ.get("EBAY_CLIENT_SECRET")
    if not client_id or not client_secret:
        return None

    if _token["value"] and time.time() < _token["expires_at"]:
        return _token["value"]

    basic = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
    try:
        resp = requests.post(
            _TOKEN_URL,
            headers={
                "Authorization": f"Basic {basic}",
                "Content-Type": "application/x-www-form-urlencoded",
            },
            data={
                "grant_type": "client_credentials",
                "scope": "https://api.ebay.com/oauth/api_scope",
            },
            timeout=_TIMEOUT_SEC,
        )
        if not resp.ok:
            return None
        data = resp.json()
    except (requests.RequestException, ValueError):
        return None

    token = data.get("access_token")
    if not token:
        return None
    # Refresh one minute before actual expiry.
    _token["value"] = token
    _token["expires_at"] = time.time() + float(data.get("expires_in", 7200)) - 60
    return token


def _listing_price(item: dict) -> tuple[float, str] | None:
    """Best price for a listing: current bid for auctions, else asking price."""
    for field in ("currentBidPrice", "price"):
        p = item.get(field) or {}
        try:
            value = float(p["value"])
        except (KeyError, TypeError, ValueError):
            continue
        if value > 0:
            return value, p.get("currency", "EUR")
    return None


def search_active_listings(item_query: str, limit: int = 100) -> list[dict]:
    """Search live eBay listings for a free-text query.

    Returns [{title, askingPrice, currency, source, bidCount, buyingOption}].
    """
    token = _get_token()
    if not token:
        return []

    cache_key = item_query.lower()
    if cache_key in _cache:
        return _cache[cache_key]

    try:
        resp = requests.get(
            _SEARCH_URL,
            params={"q": item_query, "limit": min(max(limit, 1), 50)},
            headers={
                "Authorization": f"Bearer {token}",
                "X-EBAY-C-MARKETPLACE-ID": _MARKETPLACE,
            },
            timeout=_TIMEOUT_SEC,
        )
        if not resp.ok:
            return []
        data = resp.json()
    except (requests.RequestException, ValueError):
        return []

    listings = []
    for item in data.get("itemSummaries") or []:
        title = item.get("title")
        priced = _listing_price(item)
        if not title or priced is None:
            continue
        price, currency = priced
        options = item.get("buyingOptions") or []
        listings.append(
            {
                "title": title,
                "askingPrice": round(price),
                "currency": currency,
                "source": item.get("itemWebUrl") or "ebay",
                "bidCount": item.get("bidCount", 0),
                "buyingOption": "AUCTION" if "AUCTION" in options else "FIXED_PRICE",
            }
        )
        if len(listings) >= limit:
            break

    _cache[cache_key] = listings
    return listings


def clear_cache() -> None:
    """Test hook."""
    _cache.clear()
    _token["value"] = None
    _token["expires_at"] = 0.0
