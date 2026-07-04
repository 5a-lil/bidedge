"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useApp } from "@/lib/store";

// Sidebar de l'app — copie du prototype : nav pill, dot live sur Radar,
// carte Essai Pro, profil en bas. Identité + abonnement viennent de
// GET /api/org/me au montage.

type NavItem = {
  href: string;
  label: string;
  icon: (active: boolean) => React.ReactNode;
  liveDot?: boolean;
};

type OrgRole = "owner" | "encherisseur" | "observateur";

type Me = {
  user: { id: string; name: string; email: string; isSuperAdmin: boolean };
  org: {
    id: string;
    name: string;
    slug: string;
    role: OrgRole;
    plan: string;
    planLabel: string;
    priceEUR: number;
    status: string;
    statusLabel: string;
    trialEndsAt: string | null;
    trialDaysLeft: number | null;
    monthlyBudget: number;
    defaultCeiling: number;
  };
};

const ROLE_LABEL: Record<OrgRole, string> = {
  owner: "Owner",
  encherisseur: "Enchérisseur",
  observateur: "Observateur",
};

function iconColor(active: boolean): string {
  return active ? "#147879" : "#9aa3ad";
}

const NAV_MAIN: NavItem[] = [
  {
    href: "/",
    label: "Radar",
    liveDot: true,
    icon: (a) => (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke={iconColor(a)} strokeWidth="1.6" strokeLinecap="round">
        <circle cx="8" cy="8" r="6.2" />
        <circle cx="8" cy="8" r="2.4" />
        <path d="M8 8l4.4-4.4" />
      </svg>
    ),
  },
  {
    href: "/categories",
    label: "Catégories",
    icon: (a) => (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke={iconColor(a)} strokeWidth="1.6">
        <rect x="2" y="2" width="5" height="5" rx="1.4" />
        <rect x="9" y="2" width="5" height="5" rx="1.4" />
        <rect x="2" y="9" width="5" height="5" rx="1.4" />
        <rect x="9" y="9" width="5" height="5" rx="1.4" />
      </svg>
    ),
  },
  {
    href: "/journal",
    label: "Journal",
    icon: (a) => (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke={iconColor(a)} strokeWidth="1.6" strokeLinecap="round">
        <rect x="3" y="2" width="10" height="12" rx="1.6" />
        <path d="M5.6 5.2h4.8M5.6 7.8h4.8M5.6 10.4h2.6" />
      </svg>
    ),
  },
];

const NAV_SECONDARY: NavItem[] = [
  {
    href: "/organisation",
    label: "Organisation",
    icon: (a) => (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke={iconColor(a)} strokeWidth="1.6" strokeLinecap="round">
        <circle cx="5.6" cy="5.8" r="2.3" />
        <circle cx="11" cy="6.4" r="1.8" />
        <path d="M2.4 13.2c.5-2.2 1.7-3.4 3.2-3.4s2.7 1.2 3.2 3.4M9.8 13.2c.3-1.7 1-2.7 2-2.7s1.8 1 2.1 2.7" />
      </svg>
    ),
  },
  {
    href: "/reglages",
    label: "Réglages",
    icon: (a) => (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke={iconColor(a)} strokeWidth="1.6" strokeLinecap="round">
        <path d="M2.5 5h11M2.5 11h11" />
        <circle cx="6.2" cy="5" r="1.8" fill="#fff" />
        <circle cx="10" cy="11" r="1.8" fill="#fff" />
      </svg>
    ),
  },
];

// Réservé aux super-admins — même style que les autres liens.
const NAV_ADMIN: NavItem = {
  href: "/admin",
  label: "Admin",
  icon: (a) => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke={iconColor(a)} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 1.8l5 1.9v3.5c0 3-2.1 5.2-5 6.1-2.9-.9-5-3.1-5-6.1V3.7l5-1.9z" />
      <path d="M5.9 8l1.4 1.4 2.8-2.8" />
    </svg>
  ),
};

function NavLink({ item, active, live }: { item: NavItem; active: boolean; live: boolean }) {
  return (
    <Link
      href={item.href}
      className={`flex items-center gap-[11px] rounded-full px-3 py-[9px] transition-colors ${
        active ? "bg-accent-tint text-ink" : "text-body hover:bg-[#f2f4f7]"
      }`}
    >
      <span className="flex">{item.icon(active)}</span>
      <span className="text-[13.5px] font-semibold">{item.label}</span>
      {item.liveDot && live && (
        <span className="ml-auto h-[7px] w-[7px] animate-blink rounded-full bg-accent" />
      )}
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const live = useApp((s) => s.hotMeta?.phase === "live");
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/org/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Me | null) => {
        if (alive && d) setMe(d);
      })
      .catch(() => {
        // pas connecté / réseau — on garde l'état vide
      });
    return () => {
      alive = false;
    };
  }, []);

  const logout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // on redirige quand même
    }
    router.push("/login");
  };

  const org = me?.org;
  const trialing = org?.status === "trialing" && org.trialDaysLeft != null;
  const trialPct =
    org?.trialDaysLeft != null
      ? Math.max(6, Math.min(100, Math.round((org.trialDaysLeft / 14) * 100)))
      : 0;
  const roleLabel = org ? ROLE_LABEL[org.role] : "";
  const name = me?.user.name ?? "";
  const initial = name.trim().charAt(0).toUpperCase() || "·";

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <div className="flex w-56 flex-none flex-col border-r border-hairline bg-white px-3 pb-3.5 pt-[18px]">
      <div className="flex items-center gap-2 px-2.5 pb-5 pt-0.5">
        <Link href="/" className="font-display text-[19px] font-semibold tracking-[-0.01em] text-ink">
          Bid<span className="text-accent">Edge</span>
        </Link>
      </div>

      {NAV_MAIN.map((item) => (
        <NavLink key={item.href} item={item} active={isActive(item.href)} live={live} />
      ))}
      <div className="mx-2 my-3 h-px bg-control" />
      {NAV_SECONDARY.map((item) => (
        <NavLink key={item.href} item={item} active={isActive(item.href)} live={live} />
      ))}
      {me?.user.isSuperAdmin && (
        <NavLink item={NAV_ADMIN} active={isActive("/admin")} live={live} />
      )}

      <div className="flex-1" />

      <Link
        href="/reglages"
        className="mb-2.5 flex flex-col gap-[7px] rounded-[14px] bg-app p-3 transition-colors hover:bg-control"
      >
        <div className="flex items-center gap-2">
          <span className="text-[12.5px] font-bold">
            {trialing
              ? `Essai ${org?.planLabel}`
              : org
                ? `${org.planLabel} · ${org.statusLabel}`
                : "Abonnement"}
          </span>
          {trialing && (
            <span className="ml-auto text-[11px] text-muted">{org?.trialDaysLeft} j restants</span>
          )}
        </div>
        {trialing && (
          <div className="h-[5px] overflow-hidden rounded-full bg-control-hover">
            <div className="h-full bg-accent" style={{ width: `${trialPct}%` }} />
          </div>
        )}
        <span className="text-[11.5px] font-semibold text-accent">Gérer l&apos;abonnement →</span>
      </Link>

      <Link
        href="/reglages"
        className="flex items-center gap-2.5 rounded-[14px] px-2.5 py-2 transition-colors hover:bg-[#f2f4f7]"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-tint text-[12.5px] font-bold text-accent-press">
          {initial}
        </span>
        <span className="flex flex-col leading-[1.2]">
          <span className="text-[13px] font-semibold">{name || "…"}</span>
          <span className="text-[11px] text-muted">{org ? `${roleLabel} · ${org.name}` : ""}</span>
        </span>
      </Link>

      <button
        type="button"
        onClick={logout}
        className="mt-1 flex cursor-pointer items-center gap-2 rounded-full px-3 py-[7px] text-[11.5px] font-semibold text-muted transition-colors hover:bg-[#f2f4f7] hover:text-ink"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 2.5H3.4A1.4 1.4 0 002 3.9v8.2a1.4 1.4 0 001.4 1.4H6" />
          <path d="M10.5 11l3-3-3-3M13.5 8H6" />
        </svg>
        Se déconnecter
      </button>
    </div>
  );
}
