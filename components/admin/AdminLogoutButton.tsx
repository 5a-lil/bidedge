"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";

// Déconnexion depuis le panel admin : détruit la session serveur puis renvoie
// l'opérateur sur l'écran de connexion.

export function AdminLogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const logout = async () => {
    if (pending) return;
    setPending(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Même si le réseau échoue, on ramène l'opérateur sur le login.
    }
    router.push("/login");
    router.refresh();
  };

  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.97 }}
      onClick={logout}
      disabled={pending}
      className="inline-flex h-9 cursor-pointer items-center rounded-full bg-control px-4 text-[12.5px] font-semibold text-ink transition-colors hover:bg-control-hover disabled:cursor-default disabled:opacity-60"
    >
      {pending ? "…" : "Déconnexion"}
    </motion.button>
  );
}
