import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { categories, db } from "@/lib/db";
import { requireContext } from "@/lib/auth/guards";

// GET /api/org/categories — catégories monitorées de l'org (partagées équipe).
// PUT /api/org/categories { categories: string[] } — remplace la liste.
// Source de vérité serveur pour le multi-appareil ; le localStorage reste le
// cache local.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const guard = await requireContext();
  if (!guard.ok) return guard.response;
  const rows = await db
    .select({ label: categories.label })
    .from(categories)
    .where(eq(categories.orgId, guard.value.org.id));
  return NextResponse.json({ categories: rows.map((r) => r.label) });
}

export async function PUT(req: Request): Promise<Response> {
  const guard = await requireContext();
  if (!guard.ok) return guard.response;
  const { org, role } = guard.value;
  if (role === "observateur") {
    return NextResponse.json(
      { error: { code: "forbidden", message: "Les observateurs ne modifient pas les catégories" } },
      { status: 403 },
    );
  }

  let body: { categories?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: { code: "invalid_body", message: "JSON attendu" } }, { status: 422 });
  }
  const raw = Array.isArray(body.categories) ? body.categories : null;
  if (!raw) {
    return NextResponse.json({ error: { code: "invalid_body", message: "{ categories: string[] } attendu" } }, { status: 422 });
  }
  const labels = [...new Set(raw.filter((c): c is string => typeof c === "string").map((c) => c.trim()).filter(Boolean))].slice(0, 20);

  await db.transaction(async (tx) => {
    await tx.delete(categories).where(eq(categories.orgId, org.id));
    if (labels.length > 0) {
      await tx.insert(categories).values(labels.map((label) => ({ orgId: org.id, label })));
    }
  });

  return NextResponse.json({ ok: true, categories: labels });
}
