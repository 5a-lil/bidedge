"use client";

import { useEffect } from "react";
import type { FeedEvent } from "@/lib/contracts";
import { useApp } from "@/lib/store";

// Ouvre LE flux SSE de l'app (une seule EventSource, partagée via le store).
// Monté dans le layout (app) — radar, catégories, fiche lot, journal…
// EventSource se reconnecte tout seul (retry: 2000 côté serveur).

const EVENT_TYPES: FeedEvent["type"][] = ["snapshot", "lot", "meta", "outbid", "closed", "scan", "ping"];

export function FeedProvider({ children }: { children: React.ReactNode }) {
  const hydrate = useApp((s) => s.hydrate);
  const applyFeedEvent = useApp((s) => s.applyFeedEvent);
  const setConnected = useApp((s) => s.setConnected);

  useEffect(() => {
    hydrate();
    // En mode données réelles (eBay), le radar est alimenté par l'API eBay,
    // pas par le simulateur scripté — on n'ouvre pas le flux SSE de démo
    // (sinon ses overlays « surenchéri / enchère terminée » se déclencheraient).
    if (process.env.NEXT_PUBLIC_DATA_SOURCE === "ebay") return;
    const es = new EventSource("/api/feed");
    const handlers = EVENT_TYPES.map((type) => {
      const handler = (e: MessageEvent) => {
        try {
          applyFeedEvent({ type, data: JSON.parse(e.data) } as FeedEvent);
        } catch {
          // event malformé — on ignore, le prochain tick corrige
        }
      };
      es.addEventListener(type, handler);
      return [type, handler] as const;
    });
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    return () => {
      for (const [type, handler] of handlers) es.removeEventListener(type, handler);
      es.close();
    };
  }, [hydrate, applyFeedEvent, setConnected]);

  return <>{children}</>;
}
