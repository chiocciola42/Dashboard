import { EUR, EUR0, clamp, C } from '@/lib/format';
import { hbars, hbarsStacked, donut } from '@/lib/charts';
import { formatTariffa, totalGg, type AmbitoAgg, type RefAgg } from '@/lib/distribuzione';
import type { Seniority } from '@/lib/types';

export const PAL = [C.petrol, C.gold, C.slate, C.petrolL, '#B96E15', '#8C9BB3', '#0A4A43', '#C0492F', '#2F8F5B', '#7A5AA0', '#A100FF', '#D98A2B'];

// IF count per ambito (horizontal bars).
export function buildAmbCount(ae: [string, AmbitoAgg][]): string {
  return ae.length
    ? hbars(ae.map((e) => ({ label: clamp(e[0], 34), v: e[1].n, disp: e[1].n + '', sub: 'IF', tip: `${e[0]}\n${e[1].n} IF` })), C.petrol)
    : '<div class="empty">Nessun IF in questa vista</div>';
}

// Value per ambito (horizontal bars).
export function buildAmbVal(ae: [string, AmbitoAgg][]): string {
  return ae.length
    ? hbars(ae.map((e) => ({ label: clamp(e[0], 34), v: e[1].v, disp: '€ ' + EUR0(e[1].v), tip: `${e[0]}\n${EUR(e[1].v)} · ${e[1].n} IF` })), C.petrolL)
    : '<div class="empty">Nessun IF</div>';
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

// Person-days per professional figure (donut).
export function buildSenDonut(seniority: Seniority[]): string {
  return seniority.length
    ? donut(
        seniority.map((s, i) => ({
          label: `${s.code} · ${EUR0(s.gg)} gg`,
          v: s.gg,
          c: PAL[i % PAL.length],
          tip: `${s.figura} (${s.code})\n${EUR0(s.gg)} GG/uomo${s.tariffa ? ' · ' + formatTariffa(s.tariffa) + '/gg' : ''}`,
        })),
        EUR0(totalGg(seniority)),
        'GG totali',
      )
    : '<div class="empty">Nessun dato</div>';
}
