"""Cote du marché + pré-filtre de rentabilité.

Logique volontairement simple et lisible : on établit la médiane des ventes
conclues (la « cote »), puis on décide s'il est rentable d'enchérir et jusqu'à
quel montant. Le but est de servir de PRÉ-FILTRE : on ne dépense de l'IA sur le
contexte d'un article que si son prix courant est déjà sous la cote.
"""

import statistics


def summarize_prices(prices):
    """Statistiques de base d'une distribution de prix (cote du marché)."""
    clean = sorted(p for p in prices if p is not None and p > 0)
    if not clean:
        return None
    return {
        "median": round(statistics.median(clean), 2),
        "low": round(clean[0], 2),
        "high": round(clean[-1], 2),
        # quartiles utiles pour dire "fourchette fiable"
        "p25": round(_percentile(clean, 25), 2),
        "p75": round(_percentile(clean, 75), 2),
        "count": len(clean),
    }


def _percentile(sorted_vals, pct):
    if not sorted_vals:
        return 0.0
    k = (len(sorted_vals) - 1) * (pct / 100)
    lo = int(k)
    hi = min(lo + 1, len(sorted_vals) - 1)
    frac = k - lo
    return sorted_vals[lo] * (1 - frac) + sorted_vals[hi] * frac


def evaluate(prices, current_price, target_margin=0.20, fees_rate=0.0, currency="EUR"):
    """Décide si un lot vaut le coup, et jusqu'où enchérir.

    - target_margin : marge minimale voulue sous la cote (0.20 = 20 %).
    - fees_rate     : frais estimés (commission + port), en fraction du prix.

    max_profitable_bid = médiane × (1 − marge) − frais.
    worth_bidding = le prix courant est ≤ max_profitable_bid (donc on peut
    encore enchérir en gardant la marge). is_below_market = prix < médiane.
    """
    stats = summarize_prices(prices)
    if stats is None:
        return {
            "status": "no_data",
            "median": None,
            "worth_bidding": False,
            "is_below_market": False,
            "reason": "Aucune vente comparable trouvée — cote indéterminée.",
        }

    median = stats["median"]
    max_bid = round(median * (1 - target_margin) * (1 - fees_rate), 2)

    result = {
        "status": "ok",
        "currency": currency,
        "median": median,
        "low": stats["low"],
        "high": stats["high"],
        "reliable_range": [stats["p25"], stats["p75"]],
        "sample_size": stats["count"],
        "max_profitable_bid": max_bid,
        "target_margin": target_margin,
        "fees_rate": fees_rate,
    }

    if current_price is not None:
        cp = float(current_price)
        result["current_price"] = round(cp, 2)
        # edge = écart vs médiane, négatif = sous le marché (ex. -62)
        result["edge_pct"] = round((cp / median - 1) * 100) if median else None
        result["is_below_market"] = cp < median
        result["worth_bidding"] = cp <= max_bid
        result["headroom"] = round(max_bid - cp, 2)  # combien tu peux encore monter
        if cp <= max_bid:
            result["reason"] = (
                f"Sous la cote avec marge : à {cp:.0f}{_sym(currency)} tu peux monter "
                f"jusqu'à {max_bid:.0f}{_sym(currency)} et garder {int(target_margin*100)}% de marge."
            )
        elif cp < median:
            result["reason"] = (
                f"Sous la médiane ({median:.0f}{_sym(currency)}) mais au-dessus de ta limite de "
                f"rentabilité ({max_bid:.0f}{_sym(currency)}) — marge trop fine."
            )
        else:
            result["reason"] = f"Au-dessus de la cote ({median:.0f}{_sym(currency)}) — à éviter."
    else:
        result["is_below_market"] = None
        result["worth_bidding"] = None

    return result


def _sym(currency):
    return {"EUR": "€", "USD": "$", "GBP": "£"}.get(currency, f" {currency}")
