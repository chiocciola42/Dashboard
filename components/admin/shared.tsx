'use client';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { aggregate, type Calendar, type Grain } from '@/lib/fiscal';
import { MESI, EUR } from '@/lib/format';
import { CopyTableButton } from '../export/ExportControls';
import { n } from '@/lib/adminHelpers';

export function useToast() {
  const [toast, setToast] = useState<{ msg: string; bad?: boolean } | null>(null);
  const show = useCallback((msg: string, bad = false) => {
    setToast({ msg, bad });
    setTimeout(() => setToast(null), 2600);
  }, []);
  return { toast, show };
}

// Labelled numeric input
export function NumInput({
  value,
  onChange,
  step = 0.01,
  width = 120,
}: {
  value: number | null;
  onChange: (v: number) => void;
  step?: number;
  width?: number;
}) {
  return (
    <input
      type="number"
      step={step}
      value={value == null ? '' : value}
      onChange={(e) => onChange(n(e.target.value))}
      style={{
        width,
        fontFamily: 'inherit',
        fontSize: 13,
        border: '1px solid var(--line)',
        borderRadius: 7,
        padding: '6px 8px',
        background: '#fff',
        textAlign: 'right',
      }}
    />
  );
}

export function TextInput({
  value,
  onChange,
  width,
  placeholder,
}: {
  value: string | null;
  onChange: (v: string) => void;
  width?: number | string;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      value={value ?? ''}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: width ?? '100%',
        fontFamily: 'inherit',
        fontSize: 13,
        border: '1px solid var(--line)',
        borderRadius: 7,
        padding: '6px 8px',
        background: '#fff',
      }}
    />
  );
}

// 12-month editable grid (always calendar order Gen..Dic = source of truth)
export function MonthGrid({
  values,
  onChange,
}: {
  values: number[];
  onChange: (vals: number[]) => void;
}) {
  return (
    <div className="monthgrid">
      {MESI.map((m, i) => (
        <label key={i} className="mg-cell">
          <span className="mg-lab">{m}</span>
          <input
            type="number"
            step={0.01}
            value={values[i] ?? 0}
            onChange={(e) => {
              const next = values.slice();
              next[i] = n(e.target.value);
              onChange(next);
            }}
          />
        </label>
      ))}
    </div>
  );
}

// Read-only rollups for a 12-month series, with calendar + grain toggles.
export function Rollups({ values }: { values: number[] }) {
  const [cal, setCal] = useState<Calendar>('solare');
  const [grain, setGrain] = useState<Grain>('trimestrale');
  const buckets = useMemo(() => aggregate(values, cal, grain), [values, cal, grain]);
  const tot = buckets.reduce((s, b) => s + b.value, 0);
  return (
    <div className="rollup">
      <div className="rollbar">
        <div className="seg2 small">
          <button className={cal === 'solare' ? 'on' : ''} onClick={() => setCal('solare')}>
            Anno solare
          </button>
          <button className={cal === 'fiscale' ? 'on' : ''} onClick={() => setCal('fiscale')}>
            Anno fiscale (Set–Ago)
          </button>
        </div>
        <div className="seg2 small">
          {(['mensile', 'trimestrale', 'annuale'] as Grain[]).map((gr) => (
            <button key={gr} className={grain === gr ? 'on' : ''} onClick={() => setGrain(gr)}>
              {gr[0].toUpperCase() + gr.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <div className="rollgrid">
        {buckets.map((b, i) => (
          <div key={i} className="rollcell">
            <div className="rc-lab">{b.label}</div>
            <div className="rc-val">{EUR(b.value)}</div>
          </div>
        ))}
        <div className="rollcell tot">
          <div className="rc-lab">Totale</div>
          <div className="rc-val">{EUR(tot)}</div>
        </div>
      </div>
    </div>
  );
}

// Tabella + pulsante "copia per Excel", con lo scroll orizzontale che serve a
// tutte le tabelle di questo pannello. I valori vengono letti dal DOM: molte
// celle qui sono input editabili e il pulsante deve copiare ciò che l'utente
// sta effettivamente vedendo, comprese le modifiche non ancora salvate.
export function TableBlock({
  copyTitle,
  children,
  style,
}: {
  copyTitle?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <CopyTableButton targetRef={ref} title={copyTitle} />
      </div>
      <div ref={ref} style={{ overflowX: 'auto', ...style }}>
        {children}
      </div>
    </>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="adm-field">
      <span className="adm-flab">{label}</span>
      {children}
    </label>
  );
}
