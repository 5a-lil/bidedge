import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current";
import { AdminLogoutButton } from "@/components/admin/AdminLogoutButton";

// Panel super-admin plateforme — route top-level, hors du groupe (app) :
// pas de sidebar radar ni de simulateur. Garde d'accès stricte : seul un
// opérateur BidEdge (super-admin) entre ici. Chrome sobre, barre claire.

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin");
  if (!user.isSuperAdmin) redirect("/");

  const initial = user.name.trim().charAt(0).toUpperCase() || "A";

  return (
    <div className="flex min-h-screen flex-col bg-app text-ink">
      <header className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b border-hairline bg-white px-6">
        <span className="font-display text-[18px] font-medium tracking-[-0.01em] text-ink">
          Bid<span className="text-accent">Edge</span>
        </span>
        <span className="inline-flex items-center rounded-full bg-ink px-3 py-1 text-[11px] font-semibold tracking-[.02em] text-white">
          Admin plateforme
        </span>

        <span className="flex-1" />

        <Link
          href="/"
          className="text-[13px] font-semibold text-body transition-colors hover:text-ink"
        >
          ← Retour à l&apos;app
        </Link>

        <span className="flex items-center gap-2.5 pl-1">
          <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-accent-tint text-[12.5px] font-semibold text-accent-press">
            {initial}
          </span>
          <span className="hidden text-[13px] font-semibold text-body sm:inline">{user.name}</span>
        </span>

        <AdminLogoutButton />
      </header>

      <main className="mx-auto w-full max-w-[1080px] flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
