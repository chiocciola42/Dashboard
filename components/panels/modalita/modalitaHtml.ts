import { C } from '@/lib/format';
import { chartShareCompare } from '@/lib/chartsInsight';
import { MCOL, MODLAB, type ModalitaRow } from '@/lib/modalita';

// Quota degli IF e quota del valore per modalità, affiancate (barre al 100% con fasce).
// Il drill (clic sulla barra) apre gli IF della modalità, come prima.
export function buildModalitaShare(modalita: ModalitaRow[]): string {
  return chartShareCompare(
    modalita.map((m) => ({
      label: MODLAB[m.mod] || m.mod,
      color: MCOL[m.mod] || C.slateL,
      n: m.n,
      v: m.costo,
      drill: MODLAB[m.mod],
    })),
  );
}
