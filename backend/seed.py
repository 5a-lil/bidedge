"""Seed dataset access — the always-available baseline of comparable sales.

Reads the shared dataset at lib/comparables/seed-data.json so the Python API
and any TypeScript code use the exact same numbers.
"""
from __future__ import annotations

import json
from pathlib import Path

from market import relevance

_SEED_PATH = Path(__file__).parent / "seed-data.json"
_MIN_RELEVANCE = 0.25

with _SEED_PATH.open(encoding="utf-8") as f:
    _SEED: list[dict] = json.load(f)


def seed_sales(query: str, category: str | None = None) -> list[dict]:
    """Return seed sales relevant to the query, optionally filtered by category."""
    scored = []
    for entry in _SEED:
        if category and entry["category"].lower() != category.lower():
            continue
        score = relevance(query, entry["title"])
        if score < _MIN_RELEVANCE:
            continue
        scored.append((score, entry))

    scored.sort(key=lambda pair: pair[0], reverse=True)
    return [
        {
            "title": e["title"],
            "soldPrice": e["soldPrice"],
            "source": e["source"],
            "date": e["date"],
        }
        for _, e in scored
    ]
