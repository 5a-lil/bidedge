"""Filtre de recherche en langage naturel — Gemini.

Transforme la recherche utilisateur en PLAN de recherche eBay :
mots-clés propres, accessoires à exclure (« iphone 17 » → coques, câbles…),
états à filtrer (« pour pièces » exclu sauf demande explicite), bornes de prix
exprimées en langage naturel.

Dégradation propre : sans clé ou si Gemini échoue, on renvoie un plan neutre
(la recherche marche comme avant, avec l'exclusion « pour pièces » par défaut).
"""

import json
import os
import re
import time
import unicodedata

import requests

GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

# cache { requête normalisée : (plan, expiration) } — Gemini n'est appelé
# qu'une fois par requête et par heure
_CACHE = {}
_TTL = 3600

PROMPT = """Tu es le filtre de recherche d'une application de chasse aux enchères eBay.
À partir de la recherche utilisateur, renvoie UNIQUEMENT un objet JSON valide, sans texte autour, avec exactement ces champs :
{{
  "search_query": "mots-clés eBay optimisés pour trouver LE PRODUIT lui-même",
  "exclude_keywords": ["mots dont la présence dans un TITRE d'annonce indique un accessoire ou un autre produit que celui recherché"],
  "include_parts": false,
  "min_price": null,
  "max_price": null,
  "product_kind": "libellé court du produit attendu"
}}

Règles :
- exclude_keywords doit couvrir les accessoires typiques DU produit recherché, en français ET en anglais. Exemple : pour un téléphone → coque, case, housse, étui, protection, verre trempé, vitre, film, chargeur, câble, support, adaptateur, sticker, boîte vide, box only. Pour une montre → bracelet seul, boîte seule, maillon, remontoir, écrin, verre, aiguilles, cadran seul, notice.
- include_parts = true UNIQUEMENT si l'utilisateur cherche explicitement des pièces / « pour pièces » / à réparer. Sinon false.
- min_price / max_price : uniquement si la recherche exprime un budget (« sous 500€ », « entre 100 et 300 »), sinon null.
- search_query : retire du texte tout ce qui n'est pas le produit (budget, état souhaité, « je cherche »…). Garde marque/modèle/référence.
- N'exclus JAMAIS un mot qui ferait disparaître le produit lui-même.

Recherche utilisateur : "{query}"
"""


def _norm(text):
    t = unicodedata.normalize("NFD", (text or "").lower())
    return "".join(c for c in t if not unicodedata.combining(c))


def neutral_plan(query):
    """Plan sans Gemini : pas d'exclusion de mots-clés, mais « pour pièces »
    reste exclu par défaut (règle produit)."""
    return {
        "search_query": query,
        "exclude_keywords": [],
        "include_parts": False,
        "min_price": None,
        "max_price": None,
        "product_kind": None,
        "source": "fallback",
    }


def plan_search(query):
    """Plan de recherche pour une requête utilisateur (Gemini, avec cache)."""
    key = _norm(query).strip()
    cached = _CACHE.get(key)
    if cached and cached[1] > time.time():
        return cached[0]

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return neutral_plan(query)

    model = os.getenv("GEMINI_MODEL", "gemini-flash-latest")
    try:
        resp = requests.post(
            GEMINI_URL.format(model=model),
            headers={"Content-Type": "application/json", "X-goog-api-key": api_key},
            json={
                "contents": [{"parts": [{"text": PROMPT.format(query=query)}]}],
                "generationConfig": {"temperature": 0.1, "responseMimeType": "application/json"},
            },
            timeout=12,
        )
        if resp.status_code != 200:
            return neutral_plan(query)
        text = resp.json()["candidates"][0]["content"]["parts"][0]["text"]
        # retire d'éventuelles fences ```json
        text = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.M).strip()
        raw = json.loads(text)
    except Exception:
        return neutral_plan(query)

    plan = neutral_plan(query)
    plan["source"] = "gemini"
    sq = raw.get("search_query")
    if isinstance(sq, str) and sq.strip():
        plan["search_query"] = sq.strip()
    kws = raw.get("exclude_keywords")
    if isinstance(kws, list):
        plan["exclude_keywords"] = [str(k).strip() for k in kws if str(k).strip()][:40]
    plan["include_parts"] = bool(raw.get("include_parts", False))
    for bound in ("min_price", "max_price"):
        v = raw.get(bound)
        if isinstance(v, (int, float)) and v > 0:
            plan[bound] = float(v)
    pk = raw.get("product_kind")
    if isinstance(pk, str) and pk.strip():
        plan["product_kind"] = pk.strip()

    _CACHE[key] = (plan, time.time() + _TTL)
    return plan


# marqueurs d'annonces « pour pièces » (titres/états, normalisés sans accents)
_PARTS_MARKERS = ("piece", "parts", "not working", "ne fonctionn", "defect", "hors service", "a reparer")


def is_parts_item(item):
    """True si l'annonce est vendue pour pièces / non fonctionnelle."""
    if str(item.get("conditionId") or "") == "7000":
        return True
    cond = _norm(item.get("condition") or "")
    return any(m in cond for m in _PARTS_MARKERS)


def apply_plan(items, plan):
    """Applique le plan aux annonces : exclusions de titre + état « pièces ».

    Le match est en LIMITE DE MOT (« case » n'exclut pas « showcase »).
    Renvoie (items_gardés, nb_exclus_titre, nb_exclus_pieces).
    """
    if not items:
        return items, 0, 0
    patterns = [
        re.compile(r"(?<!\w)" + re.escape(_norm(k)) + r"(?!\w)")
        for k in (plan.get("exclude_keywords") or [])
        if k and _norm(k)
    ]
    keep, out_kw, out_parts = [], 0, 0
    for it in items:
        title = _norm(it.get("title") or "")
        if any(p.search(title) for p in patterns):
            out_kw += 1
            continue
        if not plan.get("include_parts") and is_parts_item(it):
            out_parts += 1
            continue
        keep.append(it)
    return keep, out_kw, out_parts


VERDICT_PROMPT = """Tu es l'expert d'une application de chasse aux enchères eBay. Analyse UNE annonce et rends un verdict d'achat.
Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour :
{{
  "etat_reel": "lecture honnête de l'état d'après le texte (2-8 mots)",
  "red_flags": ["signaux d'alerte concrets trouvés dans l'annonce (vide si rien)"],
  "prix_max_conseille": nombre|null,
  "confiance": 0.0,
  "resume": "1 à 2 phrases calmes : faut-il suivre ce lot, et pourquoi"
}}
Règles :
- red_flags : cherche l'ambigu (photos non contractuelles, « je ne m'y connais pas », pas de facture, compte récent, incohérences modèle/référence, accessoires manquants, casse mentionnée en fin de texte…).
- prix_max_conseille : en dessous de la cote médiane fournie, ajusté selon l'état réel et les risques ; null si l'annonce est à éviter.
- confiance : 0 à 1, ta confiance dans cette lecture (texte pauvre → confiance basse).
- Français, ton direct, pas d'emphase.

Cote médiane du marché : {median} {currency}
Annonce :
- Titre : {title}
- État déclaré : {condition}
- Prix actuel : {price} {currency}
- Description : {description}
"""

_VERDICT_CACHE = {}
_VERDICT_TTL = 1800


def _strip_html(text, limit=1500):
    text = re.sub(r"<[^>]+>", " ", text or "")
    text = re.sub(r"\s+", " ", text).strip()
    return text[:limit]


def analyze_lot(item, median, currency="EUR"):
    """Verdict Gemini pour UNE annonce (dict item détaillé eBay Browse).

    Renvoie un dict verdict ou None si Gemini indisponible. Cache 30 min.
    """
    item_id = str(item.get("itemId") or item.get("legacyItemId") or "")
    cached = _VERDICT_CACHE.get(item_id)
    if cached and cached[1] > time.time():
        return cached[0]

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return None

    price = ((item.get("currentBidPrice") or item.get("price") or {}).get("value")) or "?"
    description = _strip_html(item.get("description") or item.get("shortDescription") or "")
    cond = item.get("condition") or "?"
    if item.get("conditionDescription"):
        cond = f"{cond} — {item['conditionDescription']}"

    prompt = VERDICT_PROMPT.format(
        median=median if median is not None else "inconnue",
        currency=currency,
        title=item.get("title") or "?",
        condition=cond,
        price=price,
        description=description or "(aucune description)",
    )

    model = os.getenv("GEMINI_MODEL", "gemini-flash-latest")
    try:
        resp = requests.post(
            GEMINI_URL.format(model=model),
            headers={"Content-Type": "application/json", "X-goog-api-key": api_key},
            json={
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {"temperature": 0.2, "responseMimeType": "application/json"},
            },
            timeout=15,
        )
        if resp.status_code != 200:
            return None
        text = resp.json()["candidates"][0]["content"]["parts"][0]["text"]
        text = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.M).strip()
        raw = json.loads(text)
    except Exception:
        return None

    verdict = {
        "etatReel": str(raw.get("etat_reel") or "").strip() or None,
        "redFlags": [str(f).strip() for f in (raw.get("red_flags") or []) if str(f).strip()][:6],
        "prixMaxConseille": raw.get("prix_max_conseille") if isinstance(raw.get("prix_max_conseille"), (int, float)) else None,
        "confiance": float(raw.get("confiance")) if isinstance(raw.get("confiance"), (int, float)) else None,
        "resume": str(raw.get("resume") or "").strip() or None,
    }
    if item_id:
        _VERDICT_CACHE[item_id] = (verdict, time.time() + _VERDICT_TTL)
    return verdict


def plan_summary(plan, excluded_kw=0, excluded_parts=0):
    """Résumé compact du plan pour la réponse API (transparence côté UI)."""
    return {
        "source": plan.get("source"),
        "searchQuery": plan.get("search_query"),
        "productKind": plan.get("product_kind"),
        "excludeKeywords": plan.get("exclude_keywords") or [],
        "includeParts": bool(plan.get("include_parts")),
        "minPrice": plan.get("min_price"),
        "maxPrice": plan.get("max_price"),
        "excludedByKeywords": excluded_kw,
        "excludedAsParts": excluded_parts,
    }
