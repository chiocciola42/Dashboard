import { EUR, EUR0, clamp, C } from '@/lib/format';
import { hbarsStacked } from '@/lib/charts';
import { chartPareto, chartSeniority } from '@/lib/chartsInsight';
import type { AmbitoAgg, RefAgg } from '@/lib/distribuzione';
import type { Seniority } from '@/lib/types';

// Valore per ambito con numero di IF e quota cumulata (grafico di Pareto a barre).
export function buildAmbPareto(ae: [string, AmbitoAgg][]): string {
  return chartPareto(ae.map(([label, o]) => ({ label, v: o.v, n: o.n })));
}

// Value per ARIA referent, stacked Intellera / Deloitte / other.
export function buildRefStack(re: [string, RefAgg][]): string {
  return re.length
    ? hbarsStacked(
        re.map(([k, o]) => ({
          label: clamp(k, 24),
          total: o.tot,
          disp: '€ ' + EUR0(o.tot),
          sub: o.n + ' IF',
          segs: [
            { v: o.Intellera, c: C.petrol },
            { v: o.Deloitte, c: C.gold },
            { v: o.Altro, c: C.slateL },
          ],
          tip: `${k}\nIntellera: ${EUR(o.Intellera)}\nDeloitte: ${EUR(o.Deloitte)}\nTotale: ${EUR(o.tot)} · ${o.n} IF`,
        })),
      )
    : '<div class="empty">Nessun IF</div>';
}

// Giornate/uomo per figura professionale, con tariffa e costo.
export function buildSenBars(seniority: Seniority[]): string {
  return chartSeniority(seniority.map((s) => ({ label: s.figura, code: s.code, gg: s.gg, tariffa: s.tariffa })));
}
