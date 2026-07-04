import { config } from "dotenv";
config({ path: ".env.local" });

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import bcrypt from "bcryptjs";
import * as schema from "./schema";

// Seed idempotent : super-admin plateforme + org de démo "Team RAISE" (plan Pro
// en essai, 9 jours restants — comme le prototype) avec ses membres et
// catégories. Garde le parcours démo fonctionnel après passage en auth réelle.
// Lancer : npm run db:seed

const DEMO_PASSWORD = "bidedge-demo";
const ADMIN_PASSWORD = "bidedge-admin";

async function main() {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DIRECT_URL/DATABASE_URL manquant");
  const sql = postgres(url, { prepare: false, max: 1 });
  const db = drizzle(sql, { schema });

  const demoHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const adminHash = await bcrypt.hash(ADMIN_PASSWORD, 10);

  // — super-admin plateforme —
  const [admin] = await db
    .insert(schema.users)
    .values({ email: "admin@bidedge.app", passwordHash: adminHash, name: "Admin BidEdge", isSuperAdmin: true })
    .onConflictDoUpdate({ target: schema.users.email, set: { isSuperAdmin: true, passwordHash: adminHash } })
    .returning();

  // — org de démo Pro en essai —
  const trialEndsAt = new Date(Date.now() + 9 * 24 * 3600 * 1000);
  const [org] = await db
    .insert(schema.organizations)
    .values({
      name: "Team RAISE",
      slug: "team-raise",
      plan: "pro",
      subscriptionStatus: "trialing",
      trialEndsAt,
      monthlyBudget: 600,
      defaultCeiling: 150,
    })
    .onConflictDoUpdate({
      target: schema.organizations.slug,
      set: { plan: "pro", subscriptionStatus: "trialing", trialEndsAt },
    })
    .returning();

  // — membres (l'owner Manou + l'équipe) —
  const team: { email: string; name: string; role: schema.Role }[] = [
    { email: "manou@bidedge.app", name: "Manou", role: "owner" },
    { email: "lex@bidedge.app", name: "Lex", role: "encherisseur" },
    { email: "sam@bidedge.app", name: "Sam", role: "encherisseur" },
    { email: "nina@bidedge.app", name: "Nina", role: "observateur" },
    { email: "ty@bidedge.app", name: "Ty", role: "observateur" },
  ];

  for (const m of team) {
    const [u] = await db
      .insert(schema.users)
      .values({ email: m.email, passwordHash: demoHash, name: m.name })
      .onConflictDoUpdate({ target: schema.users.email, set: { name: m.name } })
      .returning();
    await db
      .insert(schema.memberships)
      .values({ orgId: org.id, userId: u.id, role: m.role })
      .onConflictDoUpdate({ target: [schema.memberships.orgId, schema.memberships.userId], set: { role: m.role } });
  }

  // — catégories partagées de l'org —
  const cats = ["Montres Seiko vintage", "RAM DDR5 / composants", "GPU / cartes graphiques"];
  for (const label of cats) {
    const existing = await db.query.categories.findFirst({
      where: (c, { and, eq }) => and(eq(c.orgId, org.id), eq(c.label, label)),
    });
    if (!existing) await db.insert(schema.categories).values({ orgId: org.id, label });
  }

  // eslint-disable-next-line no-console
  console.log("Seed OK");
  console.log(`  super-admin : admin@bidedge.app / ${ADMIN_PASSWORD}`);
  console.log(`  owner démo  : manou@bidedge.app / ${DEMO_PASSWORD}  (org ${org.name}, ${org.plan})`);
  console.log(`  équipe      : lex|sam|nina|ty @bidedge.app / ${DEMO_PASSWORD}`);
  console.log(`  admin id    : ${admin.id}`);

  await sql.end();
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
