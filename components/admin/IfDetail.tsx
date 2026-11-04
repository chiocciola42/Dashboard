'use client';
import React, { useState } from 'react';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import type { Intervento } from '@/lib/types';
import { v12 } from '@/lib/adminHelpers';
import { NumInput, TextInput, MonthGrid, Rollups, Field } from './shared';
import RisorseEditor from './RisorseEditor';
import BefEditor from './BefEditor';

export default function IfDetail({
  iv,
  anno,
  onUpdated,
  show,
}: {
  iv: Intervento;
  anno: number;
  onUpdated: (u: Intervento) => void;
  show: (m: string, bad?: boolean) => void;
}) {
  const [core, setCore] = useState({
    titolo: iv.titolo,
    bdo: iv.bdo,
    fornitore: iv.fornitore,
    ambito: iv.ambito,
    importo: iv.importo,
    stato: iv.stato,
    has_bo: iv.has_bo,
    modalita_if: iv.modalita_if,
  });
  const [rev, setRev] = useState<number[]>(v12(iv.rev_mesi));
  const [cons, setCons] = useState<number[]>(v12(iv.cons_mesi));
  const [busy, setBusy] = useState(false);

  const saveCore = async () => {
    setBusy(true);
    try {
      const res = await fetchWithTimeout(`/api/interventi/${encodeURIComponent(iv.numero_if)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...core, rev_mesi: rev, cons_mesi: cons, anno }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      onUpdated(data.updated as Intervento);
      show(`IF ${iv.numero_if} salvato`);
    } catch {
      show('Salvataggio non riuscito', true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="card">
        <h3>
          Dettaglio IF <span className="mono">{iv.numero_if}</span>
          {iv.bdo && <span style={{ color: 'var(--muted)', fontWeight: 400 }}> · BO {iv.bdo}</span>}
        </h3>
        <div className="cap">Dati anagrafici dell&apos;intervento.</div>
        <div className="formgrid cols2">
          <Field label="Titolo">
            <TextInput value={core.titolo} onChange={(v) => setCore((c) => ({ ...c, titolo: v }))} />
          </Field>
          <Field label="Numero BO">
            <TextInput value={core.bdo} onChange={(v) => setCore((c) => ({ ...c, bdo: v }))} />
          </Field>
          <Field label="Fornitore">
            <TextInput value={core.fornitore} onChange={(v) => setCore((c) => ({ ...c, fornitore: v }))} />
          </Field>
          <Field label="Ambito">
            <TextInput value={core.ambito} onChange={(v) => setCore((c) => ({ ...c, ambito: v }))} />
          </Field>
          <Field label="Importo (€)">
            <NumInput value={core.importo} width={180} onChange={(v) => setCore((c) => ({ ...c, importo: v }))} />
          </Field>
          <Field label="Modalità">
            <TextInput value={core.modalita_if} onChange={(v) => setCore((c) => ({ ...c, modalita_if: v }))} />
          </Field>
          <Field label="Stato">
            <select
              value={core.stato}
              onChange={(e) => setCore((c) => ({ ...c, stato: e.target.value }))}
              style={{ fontFamily: 'inherit', fontSize: 13, border: '1px solid var(--line)', borderRadius: 7, padding: '6px 8px', background: '#fff' }}
            >
              <option value="approvato">approvato</option>
              <option value="non elaborato">non elaborato</option>
            </select>
          </Field>
          <Field label="BO emesso">
            <label className="chk" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <input type="checkbox" checked={core.has_bo} onChange={(e) => setCore((c) => ({ ...c, has_bo: e.target.checked }))} />
              Backoffice emesso
            </label>
          </Field>
        </div>
      </div>

      <div className="card">
        <h3>Revenue mensile {anno} · IF {iv.numero_if}</h3>
        <MonthGrid values={rev} onChange={setRev} />
        <Rollups values={rev} />
      </div>

      <div className="card">
        <h3>Consuntivazione mensile {anno} · IF {iv.numero_if}</h3>
        <MonthGrid values={cons} onChange={setCons} />
        <Rollups values={cons} />
      </div>

      <div style={{ margin: '4px 0 8px' }}>
        <button className="exp-save" disabled={busy} onClick={saveCore}>
          💾 Salva dati, revenue e consuntivazione IF
        </button>
      </div>

      <RisorseEditor numeroIf={iv.numero_if} show={show} />
      <BefEditor numeroIf={iv.numero_if} show={show} />
    </>
  );
}
