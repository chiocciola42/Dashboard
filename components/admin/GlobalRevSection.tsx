'use client';
import React, { useMemo, useState } from 'react';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import type { MultiYearTimeline } from '@/lib/types';
import { n } from '@/lib/adminHelpers';
import { MonthGrid, Rollups } from './shared';

// ---------------------------------------------------------------------------
// 2. Revenue & Consuntivazione globali (timeline)
// ---------------------------------------------------------------------------
export default function GlobalRevSection({
  my0,
  show,
}: {
  my0: MultiYearTimeline;
  show: (m: string, bad?: boolean) => void;
}) {
  // Local working copy of the multi-year data, indexed by calendar year.
  const toMap = (my: MultiYearTimeline) => {
    const m: Record<number, { rev: number[]; cons: number[] }> = {};
    for (const r of my.months) {
      if (!m[r.anno]) m[r.anno] = { rev: Array(12).fill(0), cons: Array(12).fill(0) };
      m[r.anno].rev[r.mese - 1] = n(r.revenue);
      m[r.anno].cons[r.mese - 1] = n(r.consuntivato);
    }
    return m;
  };
  const currentYear = new Date().getFullYear();
  const [data, setData] = useState<Record<number, { rev: number[]; cons: number[] }>>(() => toMap(my0));
  const years = useMemo(() => Object.keys(data).map(Number).sort((a, b) => a - b), [data]);
  const [anno, setAnno] = useState<number>(
    () => (years.includes(currentYear) ? currentYear : years[years.length - 1] ?? currentYear),
  );
  const [newYear, setNewYear] = useState<string>('');
  const [busy, setBusy] = useState(false);

  const cur = data[anno] ?? { rev: Array(12).fill(0), cons: Array(12).fill(0) };
  const setRev = (rev: number[]) => setData((d) => ({ ...d, [anno]: { ...cur, rev } }));
  const setCons = (cons: number[]) => setData((d) => ({ ...d, [anno]: { ...cur, cons } }));

  const addYear = () => {
    const y = Number(newYear);
    if (!Number.isInteger(y) || y < 2000 || y > 2100) {
      show('Anno non valido (2000–2100)', true);
      return;
    }
    if (!data[y]) setData((d) => ({ ...d, [y]: { rev: Array(12).fill(0), cons: Array(12).fill(0) } }));
    setAnno(y);
    setNewYear('');
  };

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetchWithTimeout('/api/admin/timeline/anno', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ anno, revenue: cur.rev, consuntivato: cur.cons }),
      });
      if (!res.ok) throw new Error();
      show(`Anno ${anno} salvato`);
    } catch {
      show('Salvataggio non riuscito', true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="card">
        <h3>Revenue & consuntivazione per anno</h3>
        <div className="cap">
          Inserisci i valori in ordine solare (Gen–Dic). Ogni anno è indipendente: i riepiloghi mostrano
          totali solari e fiscali, e la dashboard li aggrega su anno solare/fiscale, mensile/trimestrale.
        </div>
        <div className="seg2 small" style={{ marginBottom: 12, marginLeft: 0, display: 'inline-flex' }}>
          {years.map((y) => (
            <button key={y} className={y === anno ? 'on' : ''} onClick={() => setAnno(y)}>
              {y}
            </button>
          ))}
        </div>
        <div style={{ display: 'inline-flex', gap: 6, marginLeft: 12, alignItems: 'center' }}>
          <input
            type="number"
            placeholder="Nuovo anno"
            value={newYear}
            onChange={(e) => setNewYear(e.target.value)}
            style={{ width: 110, fontFamily: 'inherit', fontSize: 13, border: '1px solid var(--line)', borderRadius: 7, padding: '6px 8px' }}
          />
          <button className="addbtn" onClick={addYear}>+ Aggiungi anno</button>
        </div>
      </div>

      <div className="card">
        <h3>Revenue mensile · {anno}</h3>
        <div className="cap">Valori per mese in ordine solare (Gen–Dic).</div>
        <MonthGrid values={cur.rev} onChange={setRev} />
        <Rollups values={cur.rev} />
      </div>

      <div className="card">
        <h3>Consuntivazione mensile · {anno}</h3>
        <div className="cap">Valori consuntivati per mese (Gen–Dic).</div>
        <MonthGrid values={cur.cons} onChange={setCons} />
        <Rollups values={cur.cons} />
      </div>

      <div style={{ marginTop: 4 }}>
        <button className="exp-save" disabled={busy} onClick={save}>
          💾 Salva anno {anno}
        </button>
      </div>
    </>
  );
}
