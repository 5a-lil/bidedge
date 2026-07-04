"""Market-sales store (SQLite).

Every price fetched from Exa is persisted here, so the median gets richer over
time and survives restarts. SQLite is chosen for the demo: zero-config, works
fully offline (the venue wifi guardrail), and needs no external service.

To move to Neon Postgres in production: swap sqlite3 for psycopg, point at
DATABASE_URL, and change the upsert to `ON CONFLICT ... DO NOTHING` (Postgres
supports the same UNIQUE constraint used below).

All operations degrade gracefully: any DB error is swallowed so an advisory is
never blocked by storage.
"""
from __future__ import annotations

import os
import sqlite3
from contextlib import contextmanager

_DB_PATH = os.environ.get("MARKET_DB_PATH", "market.db")

_SCHEMA = """
CREATE TABLE IF NOT EXISTS market_sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_query TEXT NOT NULL,
    title TEXT NOT NULL,
    sold_price REAL NOT NULL,
    currency TEXT NOT NULL DEFAULT 'EUR',
    source TEXT NOT NULL,
    sale_date TEXT,
    fetched_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (item_query, title, sold_price)
);
"""


@contextmanager
def _connect():
    conn = sqlite3.connect(_DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    """Create the schema if needed. Safe to call repeatedly."""
    with _connect() as conn:
        conn.executescript(_SCHEMA)


def save_sales(item_query: str, sales: list[dict]) -> int:
    """Persist sales for a query (dedupes on the UNIQUE constraint).

    Returns the number of new rows inserted.
    """
    if not sales:
        return 0
    query = item_query.lower()
    inserted = 0
    try:
        with _connect() as conn:
            for sale in sales:
                cur = conn.execute(
                    """
                    INSERT OR IGNORE INTO market_sales
                        (item_query, title, sold_price, currency, source, sale_date)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (
                        query,
                        sale["title"],
                        float(sale["soldPrice"]),
                        sale.get("currency", "EUR"),
                        sale.get("source", "web"),
                        sale.get("date"),
                    ),
                )
                inserted += cur.rowcount
    except sqlite3.Error:
        return 0
    return inserted


def get_saved_sales(item_query: str, limit: int = 100) -> list[dict]:
    """Load previously stored sales for a query."""
    try:
        with _connect() as conn:
            rows = conn.execute(
                """
                SELECT title, sold_price, source, sale_date
                FROM market_sales
                WHERE item_query = ?
                ORDER BY fetched_at DESC
                LIMIT ?
                """,
                (item_query.lower(), limit),
            ).fetchall()
    except sqlite3.Error:
        return []
    return [
        {
            "title": r["title"],
            "soldPrice": r["sold_price"],
            "source": r["source"],
            "date": r["sale_date"] or "unknown",
        }
        for r in rows
    ]


def count_rows() -> int:
    """Total stored sales — handy for a health check."""
    try:
        with _connect() as conn:
            return conn.execute("SELECT COUNT(*) FROM market_sales").fetchone()[0]
    except sqlite3.Error:
        return 0
