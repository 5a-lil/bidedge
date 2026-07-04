"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { useApp } from "@/lib/store";

// Organisation — radar partagé, rôles clairs. Chaque enchère reste
// validée par la personne qui la place (aucun autobid, jamais).

const CARD = "rounded-3xl border border-hairline bg-white px-6 py-5 shadow-card";
const LABEL = "overline";

type ApiRole = "owner" | "encherisseur" | "observateur";

type Member = {
  id?: string;
  name: string;
  email: string;
  role: ApiRole;
  roleLabel: string;
};

type Invitation = {
  id: string;
  email: string;
  role: ApiRole;
  status: string;
};

// avatars teintés, cycle de 5 (fond / texte)
const TINTS = ["#e8f1f1", "#eef0f3", "#fdf1e2", "#efe9fb", "#e6f6ef"];
const TINT_TEXTS = ["#0e5a5a", "#5b616e", "#a06414", "#6b4fbb", "#059460"];

const ROLE_BADGE: Record<ApiRole, string> = {
  owner: "bg-accent-tint text-accent-press",
  encherisseur: "bg-control text-ink",
  observateur: "border border-hairline bg-white text-muted",
};

const ROLE_LABEL: Record<ApiRole, string> = {
  owner: "Owner",
  encherisseur: "Enchérisseur",
  observateur: "Observateur",
};

function initialOf(s: string): string {
  return (s.trim()[0] || "?").toUpperCase();
}

const SHARED_CATEGORIES = ["Montres Seiko vintage", "RAM DDR5", "GPU"];

export default function OrganisationPage() {
  const notify = useApp((s) => s.notify);
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [inviteVal, setInviteVal] = useState("");

  useEffect(() => {
    let alive = true;
    fetch("/api/org/members")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { members?: Member[]; invitations?: Invitation[] } | null) => {
        if (!alive || !d) return;
        setMembers(d.members ?? []);
        setInvitations(d.invitations ?? []);
      })
      .catch(() => {
        // pas connecté / réseau — listes vides
      });
    return () => {
      alive = false;
    };
  }, []);

  const invite = async () => {
    const email = inviteVal.trim();
    if (!email) {
      notify("Entre un e-mail à inviter");
      return;
    }
    try {
      const res = await fetch("/api/org/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role: "observateur" }),
      });
      if (res.status === 403) {
        notify("Seul l'Owner peut inviter");
        return;
      }
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        notify(data?.error?.message ?? "Invitation impossible");
        return;
      }
      if (data.status === "joined" && data.member) {
        const member = data.member as Member;
        setMembers((m) => [...m, member]);
        setInviteVal("");
        notify(`${member.name} a rejoint l'organisation`);
        return;
      }
      // status === "invited" — invitation en attente
      const invitedEmail: string = data.invitation?.email ?? email;
      setInvitations((inv) =>
        inv.some((i) => i.email === invitedEmail)
          ? inv
          : [...inv, { id: `pending-${invitedEmail}`, email: invitedEmail, role: "observateur", status: "pending" }],
      );
      setInviteVal("");
      notify(`Invitation envoyée à ${invitedEmail}`);
    } catch {
      notify("Invitation impossible");
    }
  };

  return (
    <div className="flex-1 animate-fade-up overflow-y-auto px-8 py-[26px]">
      <div className="flex items-center gap-3">
        <h1 className="font-display text-[32px] font-normal tracking-[-0.01em] text-ink">
          Organisation
        </h1>
        <span className="inline-flex items-center rounded-full bg-ink px-[13px] py-[5px] text-[11.5px] font-semibold text-white">
          Team RAISE · Pro
        </span>
      </div>
      <div className="mt-1.5 text-[13px] text-body">
        Un radar partagé, des rôles clairs — chaque enchère reste validée par la personne qui la
        place.
      </div>

      {/* membres */}
      <div className={`${CARD} mt-[18px] flex flex-col gap-0.5`}>
        <div className="mb-2.5 flex items-center gap-2.5">
          <span className={LABEL}>
            Membres ·&nbsp;<span className="font-mono">{members.length}</span>
          </span>
          <span className="flex-1" />
          <input
            aria-label="Inviter par e-mail"
            value={inviteVal}
            onChange={(e) => setInviteVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") invite();
            }}
            placeholder="inviter par e-mail…"
            className="h-[38px] w-[220px] rounded-full border border-hairline bg-white px-4 text-[12.5px]"
          />
          <motion.button
            type="button"
            whileTap={{ scale: 0.96 }}
            onClick={invite}
            className="inline-flex h-[38px] cursor-pointer items-center rounded-full bg-accent px-[17px] text-[12.5px] font-semibold text-white shadow-cta hover:bg-accent-press"
          >
            Inviter
          </motion.button>
        </div>
        {members.map((m, i) => (
          <motion.div
            key={m.id ?? `${m.email}-${i}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="flex items-center gap-3 border-b border-hairline py-2.5 last:border-b-0"
          >
            <span
              className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full text-[12.5px] font-semibold"
              style={{ background: TINTS[i % 5], color: TINT_TEXTS[i % 5] }}
            >
              {initialOf(m.name)}
            </span>
            <span className="flex flex-1 flex-col leading-[1.25]">
              <span className="text-[13.5px] font-semibold">{m.name}</span>
              <span className="text-[11.5px] text-muted">{m.email}</span>
            </span>
            <span
              className={`inline-flex items-center rounded-full px-[13px] py-[5px] text-[11.5px] font-semibold ${ROLE_BADGE[m.role]}`}
            >
              {m.roleLabel}
            </span>
            <button
              type="button"
              aria-label={`Options pour ${m.name}`}
              onClick={() => notify("Bientôt disponible")}
              className="cursor-pointer font-semibold text-muted hover:text-ink"
            >
              ···
            </button>
          </motion.div>
        ))}
        {invitations.map((inv) => (
          <div
            key={inv.id}
            className="flex items-center gap-3 border-b border-hairline py-2.5 last:border-b-0"
          >
            <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full bg-control text-[12.5px] font-semibold text-muted">
              {initialOf(inv.email)}
            </span>
            <span className="flex flex-1 flex-col leading-[1.25]">
              <span className="text-[13.5px] font-semibold text-body">{inv.email}</span>
              <span className="text-[11.5px] text-muted">invité · en attente</span>
            </span>
            <span className="inline-flex items-center rounded-full bg-white px-[13px] py-[5px] text-[11.5px] font-semibold text-muted">
              {ROLE_LABEL[inv.role]}
            </span>
          </div>
        ))}
      </div>

      {/* budget partagé + catégories partagées */}
      <div className="mt-3.5 grid grid-cols-2 gap-3.5">
        <div className={`${CARD} flex flex-col gap-[11px]`}>
          <span className={LABEL}>Budget partagé — juillet</span>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-[22px] font-semibold">€410</span>
            <span className="text-[12.5px] text-muted">
              dépensés sur <span className="font-mono">€2 000</span>
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-control">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: "20.5%" }}
              transition={{ duration: 0.7, ease: [0.2, 0.9, 0.3, 1] }}
              className="h-full rounded-full bg-accent"
            />
          </div>
          <span className="text-[11.5px] text-muted">
            Chaque membre garde sa propre limite par lot — le budget d&apos;équipe plafonne
            l&apos;ensemble.
          </span>
        </div>
        <div className={`${CARD} flex flex-col gap-[11px]`}>
          <span className={LABEL}>Catégories partagées</span>
          <div className="flex flex-wrap gap-2">
            {SHARED_CATEGORIES.map((c) => (
              <span
                key={c}
                className="inline-flex items-center rounded-full bg-accent-tint px-[13px] py-1.5 text-xs font-semibold text-accent-press"
              >
                {c}
              </span>
            ))}
          </div>
          <span className="text-[11.5px] text-muted">
            Visibles par toute l&apos;équipe — les alertes vont à ceux qui les ont activées.
          </span>
        </div>
      </div>

      {/* activité récente */}
      <div className={`${CARD} mb-2 mt-3.5 flex flex-col gap-0.5`}>
        <span className={`${LABEL} mb-2`}>Activité récente</span>
        <div className="flex items-center gap-2.5 border-b border-hairline py-2 text-[13px]">
          <span className="h-[7px] w-[7px] flex-none rounded-full bg-accent" />
          <span>
            <span className="font-semibold text-ink">Lex</span> a suivi{" "}
            <span className="font-semibold text-ink">RTX 3090 Ti</span>
          </span>
          <span className="ml-auto text-[11.5px] text-muted">il y a 2 min</span>
        </div>
        <div className="flex items-center gap-2.5 border-b border-hairline py-2 text-[13px]">
          <span className="h-[7px] w-[7px] flex-none rounded-full bg-hairline" />
          <span>
            <span className="font-semibold text-ink">Sam</span> a relevé sa limite GPU à{" "}
            <span className="font-mono">€600</span>
          </span>
          <span className="ml-auto text-[11.5px] text-muted">hier</span>
        </div>
        <div className="flex items-center gap-2.5 py-2 text-[13px]">
          <span className="h-[7px] w-[7px] flex-none rounded-full bg-hairline" />
          <span>
            <span className="font-semibold text-ink">Nina</span> a rejoint l&apos;organisation
          </span>
          <span className="ml-auto text-[11.5px] text-muted">lundi</span>
        </div>
      </div>
    </div>
  );
}
