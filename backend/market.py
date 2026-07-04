"""Pure pricing logic: relevance scoring, percentiles, dedupe, source counting.
Kept free of I/O so it is trivially testable.
A "sale" is a dict: {title, soldPrice, source, date}.
"""
from __future__ import annotations
import re
from typing import Iterable

VALID_CATEGORIES = ("watches", "bags", "ram")

def keywords(text: str) -> list[str]:
    return [w for w in re.split(r"\s+", text.lower()) if len(w) > 2]

def relevance(query: str, candidate_title: str) -> float:
    """Keyword-overlap score in [0, 1] between a query and a candidate title."""
    q = keywords(query)
    c = keywords(candidate_title)
    if not q or not c:
        return 0.0
    matches = sum(1 for k in q if any(k in ck or ck in k for ck in c))
    return matches / max(len(q), len(c))

def percentile(sorted_prices: list[float], p: float) -> int:
    """Linear-interpolated percentile over an ascending price list."""
    if not sorted_prices:
        raise ValueError("percentile of empty list")
    if len(sorted_prices) == 1:
        return round(sorted_prices[0])
    pos = (len(sorted_prices) - 1) * p
    base = int(pos)
    rest = pos - base
    if base + 1 < len(sorted_prices):
        value = sorted_prices[base] + (sorted_prices[base + 1] - sorted_prices[base]) * rest
    else:
        value = sorted_prices[base]
    return round(value)

def source_key(source: str) -> str:
    """Normalize a source string to a comparable identity (domain or house name)."""
    m = re.search(r"https?://(?:www\.)?([^/]+)", source or "")
    if m:
        return m.group(1).lower()
    return re.split(r"[- ,]", source or "unknown")[0].strip().lower() or "unknown"

def dedupe(sales: Iterable[dict]) -> list[dict]:
    """Drop sales with the same (title, price) ignoring case."""
    seen: set[str] = set()
    out: list[dict] = []
    for s in sales:
        try:
            price = float(s.get("soldPrice"))  # 1180 (web) == 1180.0 (DB)
        except (TypeError, ValueError):
            price = s.get("soldPrice")
        key = f"{str(s.get('title', '')).lower()}|{price}"
        if key in seen:
            continue
        seen.add(key)
        out.append(s)
    return out

def summarize(pool: list[dict], min_price: float | None = None,
              max_price: float | None = None) -> dict | None:
    """Compute the market summary (median, band, sources) over a sale pool.
    Returns None when nothing survives filtering.
    """
    pool = dedupe(pool)
    if min_price is not None:
        pool = [s for s in pool if s["soldPrice"] >= min_price]
    if max_price is not None:
        pool = [s for s in pool if s["soldPrice"] <= max_price]
    if not pool:
        return None
    prices = sorted(s["soldPrice"] for s in pool)
    sources = sorted({source_key(s.get("source", "")) for s in pool})
    return {
        "median": percentile(prices, 0.5),
        "low": round(prices[0]),
        "high": round(prices[-1]),
        "suggestedMax": round(percentile(prices, 0.75) * 1.05 / 10) * 10,
        "sampleSize": len(pool),
        "sourceCount": len(sources),
        "sources": sources,
        "sales": pool,
    }

def check_material_authenticity(attributes: dict | None) -> dict:
    """
    Analyse heuristique simple des attributs pour détecter des incohérences matérielles.
    Retourne un dict avec 'signal' (bool) et 'explanation' (str).
    """
    if not attributes:
        return {
            "signal": True,
            "explanation": "Aucun attribut matériel spécifique à analyser."
        }

    # Concaténer toutes les valeurs pour la recherche par mots-clés
    text = " ".join(str(v).lower() for v in attributes.values())

    # Règles spécifiques pour la démo (vintage phenolic-resin / faturan)
    if "amino resin" in text:
        return {
            "signal": False,
            "explanation": "Reads as amino resin, commonly used to fake catalin/faturan."
        }
    if "plastic" in text and "bakelite" in text:
        return {
            "signal": False,
            "explanation": "Mention de plastique moderne associée à la bakélite, très suspect."
        }
    if "resin" in text and not any(k in text for k in ["faturan", "catalin", "bakelite", "phenolic"]):
        return {
            "signal": False,
            "explanation": "Description générique de résine, manque de précision sur le matériau authentique."
        }

    # Si rien de suspect n'est détecté
    return {
        "signal": True,
        "explanation": "Le matériau déclaré semble cohérent et authentique."
    }