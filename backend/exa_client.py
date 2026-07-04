"""Live web-research pass via the Exa search API (https://docs.exa.ai).

Finds real completed sales across marketplaces and auction result pages and
returns them as {title, soldPrice, source, date} dicts — multi-source by
construction, each sale carrying its own source URL.

Resilience contract:
- No EXA_API_KEY -> returns [] (caller falls back to seed + DB).
- Timeout / HTTP error / malformed response -> returns [] (never raises).
- In-memory cache per query so repeated calls (and demo lots) hit the net once.
"""
from __future__ import annotations

import os
import re

import requests

_ENDPOINT = "https://api.exa.ai/search"
# Live calls take ~2s on good wifi; keep the sync path tight and use a longer
# timeout only for /api/refresh pre-warming (see search_web_sales(timeout=)).
_TIMEOUT_SEC = float(os.environ.get("EXA_TIMEOUT_SEC", "2.5"))

_cache: dict[str, list[dict]] = {}

_OUTPUT_SCHEMA = {
    "type": "object",
    "required": ["comparables"],
    "properties": {
        "comparables": {
            "type": "array",
            "description": "Recent comparable sales with concrete sold prices",
            "items": {
                "type": "object",
                "required": ["title", "soldPrice"],
                "properties": {
                    "title": {"type": "string", "description": "What was sold"},
                    "soldPrice": {"type": "number", "description": "Sold price in EUR (convert if needed)"},
                    "source": {"type": "string", "description": "Site or marketplace the sale was found on"},
                    "date": {"type": "string", "description": "Sale date, ISO format if known"},
                },
            },
        }
    },
}


def _grounding_urls(data: dict) -> dict[int, str]:
    """Map comparable index -> citation URL from the response grounding block.

    Exa returns `source` as a bare platform label ("eBay"); the actual page
    URLs live in output.grounding citations. Those are the citable sources.
    """
    urls: dict[int, str] = {}
    for g in data.get("output", {}).get("grounding") or []:
        m = re.match(r"comparables\[(\d+)\]", g.get("field") or "")
        if not m:
            continue
        idx = int(m.group(1))
        if idx in urls:
            continue
        for c in g.get("citations") or []:
            if c.get("url"):
                urls[idx] = c["url"]
                break
    return urls


def search_web_sales(item_query: str, timeout: float | None = None) -> list[dict]:
    """Search the web for real completed sales of a free-text item query."""
    api_key = os.environ.get("EXA_API_KEY")
    if not api_key:
        return []

    cache_key = item_query.lower()
    if cache_key in _cache:
        return _cache[cache_key]

    payload = {
        "query": f"{item_query} sold price auction result",
        "type": "auto",
        "numResults": 5,
        "systemPrompt": (
            "Find recent completed auction or resale sales of this exact item or "
            "close equivalents. Only report sales with a concrete sold price. "
            "Prefer marketplace and auction result pages."
        ),
        "outputSchema": _OUTPUT_SCHEMA,
        "contents": {"highlights": True},
    }

    try:
        resp = requests.post(
            _ENDPOINT,
            json=payload,
            headers={"x-api-key": api_key, "content-type": "application/json"},
            timeout=timeout or _TIMEOUT_SEC,
        )
        if not resp.ok:
            return []
        data = resp.json()
    except (requests.RequestException, ValueError):
        # Timeout, network error, malformed JSON — seed + DB cover us.
        return []

    raw = (data.get("output", {}).get("content", {}) or {}).get("comparables", []) or []
    cite_urls = _grounding_urls(data)
    sales = []
    for i, c in enumerate(raw):
        price = c.get("soldPrice")
        title = c.get("title")
        if not title or not isinstance(price, (int, float)) or price <= 0:
            continue
        # Exa sometimes leaks raw JSON fragments into the title — cut them off.
        title = re.split(r'["{}\\]', title)[0].strip().rstrip(",;|")
        if not title:
            continue
        sales.append(
            {
                "title": title,
                "soldPrice": round(price),
                # Citation URL beats the bare platform label ("eBay").
                "source": cite_urls.get(i) or c.get("source") or "web",
                "date": c.get("date") or "recent",
            }
        )
        if len(sales) >= 5:
            break

    _cache[cache_key] = sales
    return sales


def clear_cache() -> None:
    """Test hook."""
    _cache.clear()
