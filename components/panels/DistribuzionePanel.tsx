'use client';
import React from 'react';
import type { Intervento, Seniority } from '@/lib/types';
import { aggregateByAmbito, aggregateByReferente, totalImporto } from '@/lib/distribuzione';
import AmbitoTab from './distribuzione/AmbitoTab';
import ReferenteTab from './distribuzione/ReferenteTab';
import SeniorityTab from './distribuzione/SeniorityTab';

const SUBTABS = ['4a — Per Ambito', '4b — Per Referente ARIA', '4c — Per Seniority'];

function DistribuzionePanel({
  IFs,
  seniority,
  distSub,
  setDistSub,
}: {
  IFs: Intervento[];
  seniority: Seniority[];
  distSub: number;
  setDistSub: (n: number) => void;
}) {
  const tot = totalImporto(IFs);
  const ae = aggregateByAmbito(IFs);
  const re = aggregateByReferente(IFs);

  return (
    <div className="panel on" data-p="3">
      <div className="phead">
        <h2>Distribuzione IF</h2>
        <p>Analisi per ambito, referente e seniority.</p>
      </div>
      <div className="subtabs">
        {SUBTABS.map((t, i) => (
          <button key={i} className={distSub === i ? 'on' : ''} onClick={() => setDistSub(i)}>
            {t}
          </button>
        ))}
      </div>

      <AmbitoTab ae={ae} tot={tot} active={distSub === 0} />
      <ReferenteTab re={re} active={distSub === 1} />
      <SeniorityTab seniority={seniority} active={distSub === 2} />
    </div>
  );
}

// Memoized: only the active tab is mounted, but edits elsewhere in the
// Dashboard (toasts, drawer, saving flags) re-render the parent — memo skips
// re-rendering the panel when its own data/props are unchanged.
export default React.memo(DistribuzionePanel);
