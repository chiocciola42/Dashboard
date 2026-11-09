import { C, FCOL } from '@/lib/format';
import { chartPareto, chartReferenti, chartSeniority } from '@/lib/chartsInsight';
import type { AmbitoAgg, RefAgg } from '@/lib/distribuzione';
import type { RtiPartner, Seniority } from '@/lib/types';

// Valore per ambito con numero di IF e quota cumulata (grafico di Pareto a barre).
export function buildAmbPareto(ae: [string, AmbitoAgg][]): string {
  return chartPareto(ae.map(([label, o]) => ({ label, v: o.v, n: o.n })));
}

// Ripartizione di ogni referente fra TUTTE le aziende dell'RTI, contro le quote contrattuali.
export function buildRefShares(re: [string, RefAgg][], partners: RtiPartner[]): string {
  return chartReferenti(
    partners.map((p) => ({ name: p.name, color: FCOL[p.name] || C.slateL, pct: p.pct })),
    re.map(([label, o]) => ({ label, byPartner: o.byPartner, fuoriRti: o.fuoriRti, n: o.n, tot: o.tot })),
  );
}

// Giornate/uomo per figura professionale, con tariffa e costo.
export function buildSenBars(seniority: Seniority[]): string {
  return chartSeniority(seniority.map((s) => ({ label: s.figura, code: s.code, gg: s.gg, tariffa: s.tariffa })));
}
