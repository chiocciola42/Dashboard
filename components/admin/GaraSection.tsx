'use client';
import React, { useState } from 'react';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import { EUR } from '@/lib/format';
import type { Meta, RtiConfig, Seniority } from '@/lib/types';
import { NumInput, TextInput, TableBlock, Field } from './shared';

// ---------------------------------------------------------------------------
// 1. Valori di gara (meta + RTI + figure professionali/tariffe globali)
// ---------------------------------------------------------------------------
export default function GaraSection({
  meta0,
  rti0,
  sen0,
  show,
}: {
  meta0: Meta;
  rti0: RtiConfig;
  sen0: Seniority[];
  show: (m: string, bad?: boolean) => void;
}) {
  const [meta, setMeta] = useState<Meta>(meta0);
  const [ceiling, setCeiling] = useState<number>(rti0.ceiling);
  const [partners, setPartners] = useState(rti0.partners.map((p) => ({ name: p.name, pct: p.pct })));
  const [sen, setSen] = useState<Seniority[]>(sen0);
  const [busy, setBusy] = useState(false);

  const pctTot = partners.reduce((s, p) => s + p.pct, 0) * 100;

  const saveGara = async () => {
    setBusy(true);
    try {
      const res = await fetchWithTimeout('/api/admin/gara', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meta,
          rti: { massimale_totale: ceiling, partners },
        }),
      });
      if (!res.ok) throw new Error();
      show('Valori di gara salvati');
    } catch {
      show('Salvataggio non riuscito', true);
    } finally {
      setBusy(false);
    }
  };

  const saveTariffe = async () => {
    setBusy(true);
    try {
      const res = await fetchWithTimeout('/api/admin/tariffe', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seniority: sen }),
      });
      if (!res.ok) throw new Error();
      show('Figure professionali salvate');
    } catch {
      show('Salvataggio non riuscito', true);
    } finally {
      setBusy(false);
    }
  };

  const setMetaField = (k: keyof Meta, v: string | number) => setMeta((m) => ({ ...m, [k]: v }));

  return (
    <>
      <div className="card">
        <h3>Dati contrattuali / di gara</h3>
        <div className="cap">Metadati del contratto SISS L2 mostrati in dashboard.</div>
        <div className="formgrid cols2">
          <Field label="CIG">
            <TextInput value={meta.cig} onChange={(v) => setMetaField('cig', v)} />
          </Field>
          <Field label="Contratto">
            <TextInput value={meta.contratto} onChange={(v) => setMetaField('contratto', v)} />
          </Field>
          <Field label="ODA/G">
            <TextInput value={meta.odag} onChange={(v) => setMetaField('odag', v)} />
          </Field>
          <Field label="Durata (mesi)">
            <NumInput value={meta.months} step={1} onChange={(v) => setMetaField('months', v)} />
          </Field>
          <Field label="Data contratto">
            <TextInput value={meta.contract_date} onChange={(v) => setMetaField('contract_date', v)} placeholder="AAAA-MM-GG" />
          </Field>
          <Field label="Valido fino al">
            <TextInput value={meta.valid_to} onChange={(v) => setMetaField('valid_to', v)} placeholder="AAAA-MM-GG" />
          </Field>
        </div>
      </div>

      <div className="card">
        <h3>Massimale e quote RTI</h3>
        <div className="cap">
          Massimale contrattuale e ripartizione per partner. Le quote in € si ricalcolano dalla
          percentuale. Somma percentuali: <b style={{ color: Math.abs(pctTot - 100) > 0.1 ? 'var(--bad)' : 'var(--good)' }}>{pctTot.toFixed(1)}%</b>
        </div>
        <Field label="Massimale totale (€)">
          <NumInput value={ceiling} width={200} onChange={setCeiling} />
        </Field>
        <TableBlock copyTitle="Copia quote RTI per Excel" style={{ marginTop: 14 }}>
        <table className="datatable">
          <thead>
            <tr>
              <th>Partner</th>
              <th style={{ textAlign: 'right' }}>Quota %</th>
              <th style={{ textAlign: 'right' }}>Quota €</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {partners.map((p, i) => (
              <tr key={i}>
                <td>
                  <TextInput
                    value={p.name}
                    onChange={(v) =>
                      setPartners((ps) => ps.map((x, j) => (j === i ? { ...x, name: v } : x)))
                    }
                  />
                </td>
                <td style={{ textAlign: 'right' }}>
                  <NumInput
                    value={Number((p.pct * 100).toFixed(4))}
                    width={90}
                    onChange={(v) =>
                      setPartners((ps) => ps.map((x, j) => (j === i ? { ...x, pct: v / 100 } : x)))
                    }
                  />
                </td>
                <td style={{ textAlign: 'right' }}>{EUR(ceiling * p.pct)}</td>
                <td style={{ textAlign: 'right' }}>
                  <button
                    className="ubtn bad"
                    onClick={() => setPartners((ps) => ps.filter((_, j) => j !== i))}
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </TableBlock>
        <button
          className="ubtn"
          style={{ marginTop: 10 }}
          onClick={() => setPartners((ps) => [...ps, { name: 'Nuovo partner', pct: 0 }])}
        >
          + Aggiungi partner
        </button>
        <div style={{ marginTop: 16 }}>
          <button className="exp-save" disabled={busy} onClick={saveGara}>
            💾 Salva valori di gara
          </button>
        </div>
      </div>

      <div className="card">
        <h3>Figure professionali e tariffe</h3>
        <div className="cap">Listino figure (giorni uomo a portafoglio e tariffa giornaliera).</div>
        <TableBlock copyTitle="Copia figure professionali e tariffe per Excel">
        <table className="datatable">
          <thead>
            <tr>
              <th>Figura</th>
              <th>Sigla</th>
              <th style={{ textAlign: 'right' }}>Giorni uomo</th>
              <th style={{ textAlign: 'right' }}>Tariffa gg (€)</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sen.map((s, i) => (
              <tr key={i}>
                <td>
                  <TextInput value={s.figura} onChange={(v) => setSen((l) => l.map((x, j) => (j === i ? { ...x, figura: v } : x)))} />
                </td>
                <td>
                  <TextInput value={s.code} width={140} onChange={(v) => setSen((l) => l.map((x, j) => (j === i ? { ...x, code: v } : x)))} />
                </td>
                <td style={{ textAlign: 'right' }}>
                  <NumInput value={s.gg} step={1} width={90} onChange={(v) => setSen((l) => l.map((x, j) => (j === i ? { ...x, gg: v } : x)))} />
                </td>
                <td style={{ textAlign: 'right' }}>
                  <NumInput value={s.tariffa} width={110} onChange={(v) => setSen((l) => l.map((x, j) => (j === i ? { ...x, tariffa: v } : x)))} />
                </td>
                <td style={{ textAlign: 'right' }}>
                  <button className="ubtn bad" onClick={() => setSen((l) => l.filter((_, j) => j !== i))}>×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </TableBlock>
        <button
          className="ubtn"
          style={{ marginTop: 10 }}
          onClick={() => setSen((l) => [...l, { figura: 'Nuova figura', code: '', gg: 0, tariffa: 0 }])}
        >
          + Aggiungi figura
        </button>
        <div style={{ marginTop: 16 }}>
          <button className="exp-save" disabled={busy} onClick={saveTariffe}>
            💾 Salva figure professionali
          </button>
        </div>
      </div>
    </>
  );
}
