import { EUR, PCT, C } from '@/lib/format';
import { donut, chartVBars } from '@/lib/charts';
import { MCOL, MODLAB, type ModalitaRow } from '@/lib/modalita';

// Value share per modalità (donut), or an empty-state block.
export function buildModalitaDonut(modalita: ModalitaRow[], tot: number): string {
  return modalita.length
    ? donut(
        modalita.map((m) => ({
          label: `${MODLAB[m.mod] || m.mod} · ${PCT((m.costo / tot) * 100)}`,
          v: m.costo,
          c: MCOL[m.mod] || C.slateL,
          tip: `${MODLAB[m.mod] || m.mod}\n${EUR(m.costo)} · ${PCT((m.costo / tot) * 100)} · ${m.n} IF`,
        })),
        '',
        '',
      )
    : '<div class="empty">Nessun dato</div>';
}

// IF count per modalità (clickable vertical bars).
export function buildModalitaBars(modalita: ModalitaRow[]): string {
  return modalita.length
    ? chartVBars(
        modalita.map((m) => ({
          label: MODLAB[m.mod] || m.mod,
          val: m.n,
          color: MCOL[m.mod] || C.slateL,
          drill: MODLAB[m.mod],
          tip: `${MODLAB[m.mod] || m.mod}\nN° IF: ${m.n}\nCosto: ${EUR(m.costo)}\n(clic per vedere gli IF)`,
        })),
      )
    : '';
}
