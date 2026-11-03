'use client';
import React, { useState } from 'react';
import type { RtiConfig } from '@/lib/types';
import { validateRtiForm } from '@/lib/rtiForm';

export default function RtiConfigForm({
  rti,
  onUpdate,
}: {
  rti: RtiConfig;
  onUpdate: (u: { massimale_totale: number; quota_intellera_pct: number; quota_deloitte_pct: number }) => void;
}) {
  const intq = rti.partners.find((p) => p.name === 'Intellera')?.pct ?? 0.65;
  const delq = rti.partners.find((p) => p.name === 'Deloitte')?.pct ?? 0.2;
  const [open, setOpen] = useState(false);
  const [mass, setMass] = useState(rti.ceiling);
  const [intPct, setIntPct] = useState(Math.round(intq * 100));
  const [delPct, setDelPct] = useState(Math.round(delq * 100));
  const [err, setErr] = useState('');

  // Always start from the current, persisted values — a previous unsaved
  // edit must not resurface next time the form is reopened.
  const resetFromProps = () => {
    setMass(rti.ceiling);
    setIntPct(Math.round(intq * 100));
    setDelPct(Math.round(delq * 100));
    setErr('');
  };

  if (!open) {
    return (
      <div style={{ marginBottom: 14 }}>
        <button
          className="freset"
          onClick={() => {
            resetFromProps();
            setOpen(true);
          }}
          style={{ borderColor: 'var(--petrol)', color: 'var(--petrol-d)' }}
        >
          ⚙️ Configura parametri RTI
        </button>
      </div>
    );
  }
  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <h3>Parametri RTI</h3>
      <div className="formgrid">
        <label>
          Massimale contrattuale (€)
          <input type="number" min={0} value={mass} onChange={(e) => setMass(Number(e.target.value))} />
        </label>
        <label>
          Quota % Intellera
          <input
            type="number"
            min={0}
            max={100}
            value={intPct}
            onChange={(e) => {
              const v = Number(e.target.value);
              setIntPct(v);
              setDelPct(100 - v);
            }}
          />
        </label>
        <label>
          Quota % Deloitte (auto)
          <input type="number" value={delPct} readOnly />
        </label>
      </div>
      {err && (
        <div className="form-err" style={{ color: 'var(--bad, #c0392b)', marginTop: 8 }}>
          {err}
        </div>
      )}
      <div className="formbtns">
        <button
          className="addbtn"
          onClick={() => {
            const invalid = validateRtiForm({ mass, intPct, delPct });
            if (invalid) {
              setErr(invalid);
              return;
            }
            onUpdate({ massimale_totale: mass, quota_intellera_pct: intPct, quota_deloitte_pct: delPct });
            setOpen(false);
          }}
        >
          Aggiorna
        </button>
        <button
          className="clearbtn"
          onClick={() => {
            resetFromProps();
            setOpen(false);
          }}
        >
          Annulla
        </button>
      </div>
    </div>
  );
}
