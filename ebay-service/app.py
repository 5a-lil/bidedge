"""API Flask BidEdge — expose les données eBay officielles au front Next.js.

Endpoints :
  GET /health                         état du service + présence des identifiants
  GET /auctions?q=&min_price=&max_price=&limit=      annonces d'enchères actives (Browse)
  GET /item/<item_id>                 détail d'un lot (enchère courante, fin)
  GET /market/median?q=&days=&condition_ids=         cote = médiane des ventes conclues (Insights)
  GET /market/evaluate?q=&current_price=&target_margin=&fees_rate=   pré-filtre de rentabilité

Aucune écriture, aucune enchère : lecture seule via les API officielles eBay.
"""

import os

from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS

from ebay_collector import EbayAuthError, EbayCollector
from gemini_filter import analyze_lot, apply_plan, plan_search, plan_summary
from market import evaluate as evaluate_deal
from market import summarize_prices

load_dotenv()

app = Flask(__name__)
# Le front Next.js (localhost:3000 en dev) appelle ce service.
CORS(app, origins=os.getenv("CORS_ORIGINS", "*").split(","))

collector = EbayCollector()


def _err(message, status):
    return jsonify({"error": {"message": message}}), status


@app.errorhandler(EbayAuthError)
def _handle_auth_error(e):
    # 503 : le service tourne mais eBay n'est pas exploitable (creds/accès)
    return _err(str(e), 503)


def _map_summary(item):
    """Item summary Browse eBay → forme légère consommée par le front."""
    price = item.get("currentBidPrice") or item.get("price") or {}
    return {
        "itemId": item.get("itemId"),
        "title": item.get("title"),
        "currentBid": _to_float(price.get("value")),
        "currency": price.get("currency"),
        "bidCount": item.get("bidCount"),
        "itemEndDate": item.get("itemEndDate"),
        "imageUrl": (item.get("image") or {}).get("imageUrl"),
        "condition": item.get("condition"),
        "categories": [c.get("categoryName") for c in item.get("categories", []) if c.get("categoryName")],
        "seller": _map_seller(item.get("seller") or {}),
        "itemWebUrl": item.get("itemWebUrl"),
        "buyingOptions": item.get("buyingOptions"),
    }


def _map_seller(seller):
    return {
        "name": seller.get("username"),
        "feedbackPercentage": _to_float(seller.get("feedbackPercentage")),
        "feedbackScore": seller.get("feedbackScore"),
    }


def _to_float(v):
    try:
        return float(v) if v is not None else None
    except (TypeError, ValueError):
        return None


def _q():
    q = (request.args.get("q") or "").strip()
    if not q:
        raise ValueError("Paramètre 'q' requis")
    return q


@app.get("/health")
def health():
    return jsonify(
        {
            "ok": True,
            "service": "bidedge-ebay",
            "has_credentials": collector.has_credentials(),
            "marketplace": collector.marketplace_id,
            "currency": collector.currency,
        }
    )


@app.get("/auctions")
def auctions():
    try:
        q = _q()
    except ValueError as e:
        return _err(str(e), 422)
    min_price = _to_float(request.args.get("min_price"))
    max_price = _to_float(request.args.get("max_price"))
    limit = int(request.args.get("limit", 50))
    # fenêtre de clôture : par défaut, seules les enchères qui ferment sous 24 h
    max_hours = _to_float(request.args.get("max_hours"))
    if max_hours is None:
        max_hours = 24.0

    # plan Gemini : requête nettoyée, accessoires exclus, états filtrés,
    # bornes de prix exprimées en langage naturel
    plan = plan_search(q)
    effective_q = plan.get("search_query") or q
    if min_price is None:
        min_price = plan.get("min_price")
    if max_price is None:
        max_price = plan.get("max_price")

    items = collector.get_auctions(effective_q, min_price=min_price, max_price=max_price, limit=limit)
    # pertinence ANCRÉE sur le marché global : parmi les enchères seules, la
    # camelote (pièces, stickers, pubs) peut être majoritaire — l'ancre vient
    # de la catégorie dominante des annonces tous formats (« rolex » → Montres)
    anchor = collector.market_anchor(effective_q)
    items, dominant = collector.filter_relevant(items, effective_q, anchor_leaf=anchor)
    items, out_kw, out_parts = apply_plan(items, plan)
    items = collector.filter_closing_within(items, max_hours)
    return jsonify(
        {
            "query": q,
            "count": len(items),
            "dominantCategory": dominant,
            "maxHours": max_hours,
            "plan": plan_summary(plan, out_kw, out_parts),
            "items": [_map_summary(i) for i in items],
        }
    )


@app.get("/item/<path:item_id>")
def item(item_id):
    data = collector.get_item(item_id)
    return jsonify(data)


@app.get("/lot/analyze")
def lot_analyze():
    """Verdict IA pour UN lot déjà jugé rentable (pré-filtre respecté :
    l'appelant ne demande l'analyse que si worth_bidding est vrai).

    Params : item_id (requis), median (optionnel — évite de recalculer la cote).
    """
    item_id = (request.args.get("item_id") or "").strip()
    if not item_id:
        return _err("Paramètre 'item_id' requis", 422)
    median = _to_float(request.args.get("median"))

    data = collector.get_item(item_id)
    verdict = analyze_lot(data, median, currency=collector.currency)
    if verdict is None:
        return _err("Analyse indisponible (clé Gemini manquante ou service saturé)", 503)
    return jsonify({"itemId": item_id, "median": median, "verdict": verdict})


@app.get("/market/median")
def market_median():
    try:
        q = _q()
    except ValueError as e:
        return _err(str(e), 422)
    days = int(request.args.get("days", 90))
    limit = int(request.args.get("limit", 100))
    cond = request.args.get("condition_ids")
    condition_ids = [c for c in cond.split(",") if c] if cond else None

    plan = plan_search(q)
    est = collector.market_estimate(plan.get("search_query") or q, condition_ids=condition_ids, days=days, limit=limit, plan=plan)
    stats = summarize_prices(est["prices"])
    return jsonify(
        {
            "query": q,
            "currency": collector.currency,
            "sources": ["eBay"],
            "basis": est["basis"],  # "sold_90d" | "active_listings"
            "dominantCategory": est.get("dominant_category"),
            "plan": plan_summary(plan),
            "stats": stats,
            "sample_size": len(est["prices"]),
            "comparables": est["samples"],
        }
    )


@app.get("/market/evaluate")
def market_evaluate():
    """PRÉ-FILTRE : cote + décision de rentabilité pour UN prix courant donné.

    Renvoie worth_bidding / is_below_market / max_profitable_bid. Le front
    n'enchaîne l'analyse IA du contexte de l'article QUE si worth_bidding.
    """
    try:
        q = _q()
    except ValueError as e:
        return _err(str(e), 422)
    current_price = _to_float(request.args.get("current_price"))
    target_margin = _to_float(request.args.get("target_margin"))
    fees_rate = _to_float(request.args.get("fees_rate"))
    days = int(request.args.get("days", 90))
    limit = int(request.args.get("limit", 100))
    cond = request.args.get("condition_ids")
    condition_ids = [c for c in cond.split(",") if c] if cond else None

    plan = plan_search(q)
    est = collector.market_estimate(plan.get("search_query") or q, condition_ids=condition_ids, days=days, limit=limit, plan=plan)
    result = evaluate_deal(
        est["prices"],
        current_price=current_price,
        target_margin=target_margin if target_margin is not None else 0.20,
        fees_rate=fees_rate if fees_rate is not None else 0.0,
        currency=collector.currency,
    )
    result["query"] = q
    result["sources"] = ["eBay"]
    result["basis"] = est["basis"]  # "sold_90d" | "active_listings"
    result["dominantCategory"] = est.get("dominant_category")
    result["plan"] = plan_summary(plan)
    result["comparables"] = est["samples"]
    return jsonify(result)


if __name__ == "__main__":
    port = int(os.getenv("PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=os.getenv("FLASK_DEBUG") == "1")
