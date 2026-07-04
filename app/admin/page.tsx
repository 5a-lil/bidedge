import { OrgTable } from "@/components/admin/OrgTable";

// Vue d'ensemble des tenants : chaque ligne pilote l'abonnement d'une org
// (plan, statut, essai). Table opérationnelle, chaque valeur sert une décision.

export default function AdminOrgsPage() {
  return (
    <div className="animate-fade-up">
      <h1 className="font-display text-[32px] font-normal tracking-[-0.01em] text-ink">
        Organisations
      </h1>
      <p className="mt-1.5 text-[13.5px] text-body">Gère les abonnements de tous les tenants.</p>
      <OrgTable />
    </div>
  );
}
