import { requireUser } from "@/lib/auth/guards";
import { getMonitorData, parseMonitorParams } from "@/lib/monitor";

// GET /api/monitor/stream?types=a|b|c&max_hours=24 — flux SSE temps réel du
// radar : le serveur interroge eBay toutes les ~25 s pour chaque type et
// pousse un event `monitor` par type. Le client garde une seule EventSource
// au lieu de plusieurs polls.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const encoder = new TextEncoder();
const REFRESH_MS = 25_000;
const PING_MS = 15_000;

export async function GET(req: Request): Promise<Response> {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const types = (url.searchParams.get("types") ?? "")
    .split("|")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 8);
  if (types.length === 0) {
    return new Response(JSON.stringify({ error: { code: "missing_types", message: "?types=a|b requis" } }), {
      status: 422,
      headers: { "Content-Type": "application/json" },
    });
  }
  const { margin, maxHours } = parseMonitorParams(url);

  let refreshTimer: ReturnType<typeof setInterval> | null = null;
  let pingTimer: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let running = false;

      const cleanup = () => {
        if (closed) return;
        closed = true;
        if (refreshTimer) clearInterval(refreshTimer);
        if (pingTimer) clearInterval(pingTimer);
        try {
          controller.close();
        } catch {
          // déjà fermé
        }
      };

      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          cleanup();
        }
      };

      const refreshAll = async () => {
        if (running || closed) return; // pas de rafales concurrentes
        running = true;
        for (const t of types) {
          if (closed) break;
          try {
            send("monitor", await getMonitorData(t, margin, maxHours));
          } catch {
            // eBay/Flask indisponible pour ce type — on retentera au prochain tour
          }
        }
        running = false;
      };

      controller.enqueue(encoder.encode("retry: 3000\n\n"));
      void refreshAll(); // premier envoi immédiat
      refreshTimer = setInterval(() => void refreshAll(), REFRESH_MS);
      pingTimer = setInterval(() => send("ping", { t: Date.now() }), PING_MS);

      req.signal.addEventListener("abort", cleanup);
    },
    cancel() {
      if (refreshTimer) clearInterval(refreshTimer);
      if (pingTimer) clearInterval(pingTimer);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
