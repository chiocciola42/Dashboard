'use client';
import React from 'react';
import type { Intervento } from '@/lib/types';
import { aggregateModalita } from '@/lib/modalita';
import { Html } from '../Html';
import { ChartCard } from '../export/ExportControls';
import ModalitaTable from './modalita/ModalitaTable';
import { buildModalitaShare } from './modalita/modalitaHtml';
import { legchips } from '@/lib/charts';
import { MCOL, MODLAB } from '@/lib/modalita';
import { C } from '@/lib/format';

function ModalitaPanel({
  interventi,
  onDrillMod,
}: {
  interventi: Intervento[];
  onDrillMod: (modLabel: string) => void;
}) {
  // Computed live from the (already filtered) portfolio in view, so this panel
  // reacts to FilterBar/uploads/edits like every other panel — it previously
  // read a static seed snapshot that never changed and never respected filters.
  const { rows: modalita, tot } = aggregateModalita(interventi);
  const modShare = buildModalitaShare(modalita);

  const onDrill = (e: React.MouseEvent<HTMLDivElement>) => {
    const t = (e.target as HTMLElement).closest('[data-drill-mod]') as HTMLElement | null;
    if (t) onDrillMod(t.getAttribute('data-drill-mod') || '');
  };


  return (
    <div className="panel on" data-p="4">
      <div className="phead">
        <h2>Modalità fornitura</h2>
        <p>Distribuzione per tipologia contrattuale · vista corrente (rispetta i filtri attivi).</p>
      </div>
      <ChartCard
        title="Le modalità pesano di più per numero o per valore?"
        caption="Quota degli IF e quota del valore per tipologia contrattuale · clic su una barra per vedere gli IF"
        filename="Modalita_numero_vs_valore"
      >
        <Html
          ariaLabel={`Confronto fra quota degli IF e quota del valore per modalità. ${modalita
            .map((m) => `${MODLAB[m.mod] || m.mod}: ${m.n} IF, ${Math.round((m.costo / tot) * 100)}% del valore`)
            .join('; ')}.`}
          html={modShare}
          onClick={onDrill}
        />
        <Html
          className="legrow"
          html={legchips(modalita.map((m) => ({ c: MCOL[m.mod] || C.slateL, t: MODLAB[m.mod] || m.mod })))}
        />
      </ChartCard>
      <ModalitaTable modalita={modalita} tot={tot} onDrillMod={onDrillMod} />
      <div className="foot" style={{ marginTop: 14 }}>
        <b>Note:</b> A_corpo = fatturazione a consegna milestone · A_canone = fatturazione mensile ricorrente · A_consumo =
        fatturazione a misura (GG/Uomo).
      </div>
    </div>
  );
}

// Memoized: only the active tab is mounted, but edits elsewhere in the
// Dashboard (toasts, drawer, saving flags) re-render the parent — memo skips
// re-rendering the panel when its own data/props are unchanged.
export default React.memo(ModalitaPanel);
