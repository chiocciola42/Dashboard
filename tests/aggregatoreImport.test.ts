import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';
import { POST } from '@/app/api/upload/route';
import { getDashboardData } from '@/lib/getDashboardData';
import { sumByPartner } from '@/lib/rtiErosion';
import { conta } from '@/lib/riconciliazione';
import { parseFile } from '@/lib/parsers';
import { createIntervento } from '@/lib/store';
import { workbook, type Cell } from './helpers/xlsx';

// Importazione end-to-end dell'Aggregatore: file -> /api/upload -> store -> payload della dashboard.
// I numeri della dashboard (totali per IF, per partner, costi di fornitura) devono coincidere con
// quelli che l'Aggregatore calcola da solo.
vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return { ...actual, getSessionUser: async () => ({ id: 1, email: 'a@x.it', role: 'ADMIN', status: 'approved' }) };
});
vi.mock('next/cache', () => ({ revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));

const GEN: Cell[] = ['File Sorgente', 'Titolo Intervento', 'Numero IF', 'Codice Ultimo BDO', 'Importo Intervento', 'Ref. Fornitore - Mail', 'Ref. ARIA - Nome Cognome'];
const OF: Cell[] = ['File Sorgente', 'Num Linea', 'Modalità Fornitura', 'Cod. Milestone / Attività', 'Costo Complessivo', 'Fornitore', 'Subappalto SI/NO', 'Numero IF'];
const GDL: Cell[] = ['File Sorgente', 'Cod. Milestone / Attività', 'Figure Professionali', 'GG / Uomo', 'Azienda di Appartenenza', 'Numero IF'];
const ANAG: Cell[] = ['Numero IF', 'Titolo Intervento', 'Ambito', 'Attivazione immediata', 'Note', 'Stato'];

const INTELLERA = 'Intellera Consulting S.p.A.';
const DELOITTE = 'Deloitte Consulting S.r.l. Società Benefit';

const sintetico = () =>
  workbook({
    'Generalità Intervento': [
      GEN,
      ['a.xlsx', 'IF uno', 20260001, 2026330001, 1000, 'a@intellera.it', 'Rossi'],
      ['b.xlsx', 'IF due (misto)', 20260002, '-', 600, 'b@intellera.it', 'Rossi'],
      ['c.xlsx', 'IF tre', 20260003, 2026330003, 400.5, 'c@deloitte.it', 'Bianchi'],
    ],
    'Oggetto Fornitura': [
      OF,
      ['a.xlsx', 1, 'A_corpo', 'MLS01', 1000, INTELLERA, 'NO', 20260001],
      ['b.xlsx', 1, 'A_corpo', 'MLS01', 450, INTELLERA, 'NO', 20260002],
      ['b.xlsx', 2, 'A_canone', 'CAN01', 150, DELOITTE, 'NO', 20260002],
      ['c.xlsx', 1, 'A_corpo', 'MLS01', 400.5, DELOITTE, 'NO', 20260003],
    ],
    'GdL - Gruppo di Lavoro': [
      GDL,
      ['a.xlsx', 'MLS01', 'Strategy Consultant', 10, INTELLERA, 20260001],
      ['b.xlsx', 'MLS01', 'Strategy Consultant', 5, INTELLERA, 20260002],
      ['c.xlsx', 'MLS01', 'Project Manager', 3, DELOITTE, 20260003],
    ],
    'Anagrafica IF': [ANAG, [20260001, 'IF uno', 'Prevenzione', 'SI', null, 'Attiva'], [20260003, 'IF tre', 'FSE e Presa in Carico', 'NO', null, 'Attiva']],
  });

async function carica(buf: Buffer, nome = 'Aggregatore_Dati_ARIA.xlsm', query = '?force=true'): Promise<Record<string, unknown>> {
  const form = new FormData();
  form.set('file', new File([new Uint8Array(buf)], nome));
  const res = await POST(new Request(`http://localhost/api/upload${query}`, { method: 'POST', body: form }));
  const body = (await res.json()) as Record<string, unknown>;
  expect(res.status, JSON.stringify(body)).toBe(200);
  return body;
}

// Il payload aggiunge `impegnato` a rti (rtiSummary) oltre ai campi del tipo RtiConfig.
const impegnatoDi = (d: { rti: unknown }): number => (d.rti as { impegnato: number }).impegnato;
const somma = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

beforeEach(() => {
  const g = globalThis as Record<string, unknown>;
  for (const k of Object.keys(g)) if (k.startsWith('__ARIA_')) delete g[k];
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('Aggregatore: import completo e coerenza dei numeri', () => {
  it('imports IFs, supply lines and GdL rows with the counts of the file', async () => {
    const body = await carica(sintetico());
    expect(body).toMatchObject({ ok: true, kind: 'aggregatore', gdl_saved: 3, fornitura_saved: 4 });
  });

  it('the dashboard total equals the sum of the supply costs (Generalità vs Oggetto Fornitura)', async () => {
    await carica(sintetico());
    const d = await getDashboardData(2026);
    const ifs = d.interventi.filter((i) => ['20260001', '20260002', '20260003'].includes(i.numero_if));
    expect(somma(ifs.map((i) => i.importo))).toBeCloseTo(2000.5, 2);
    const forn = d.controlli.esiti.filter((e) => e.confronto === 'gen_forn' && ['20260001', '20260002', '20260003'].includes(e.numero_if));
    expect(forn).toHaveLength(3);
    expect(conta(forn).quadra).toBe(3);
  });

  it('REGRESSION: an IF with BDO "-" is not counted as having a purchase order', async () => {
    await carica(sintetico());
    const d = await getDashboardData(2026);
    const due = d.interventi.find((i) => i.numero_if === '20260002');
    expect(due).toMatchObject({ has_bo: false, stato: 'non elaborato', bdo: null });
    expect(d.interventi.find((i) => i.numero_if === '20260001')).toMatchObject({ has_bo: true });
  });

  it('REGRESSION: ambito and attivazione come from Anagrafica IF', async () => {
    await carica(sintetico());
    const d = await getDashboardData(2026);
    expect(d.interventi.find((i) => i.numero_if === '20260001')).toMatchObject({ ambito: 'Prevenzione', attivazione: 'SI' });
    expect(d.interventi.find((i) => i.numero_if === '20260002')?.ambito).toBeNull();
  });

  it('re-uploading never replaces an ambito already set with a missing one', async () => {
    await carica(sintetico());
    const senzaAnagrafica = workbook({ 'Generalità Intervento': [GEN, ['a.xlsx', 'IF uno', 20260001, 2026330001, 1000, 'a@intellera.it', 'Rossi']] });
    await carica(senzaAnagrafica);
    const d = await getDashboardData(2026);
    expect(d.interventi.find((i) => i.numero_if === '20260001')?.ambito).toBe('Prevenzione');
  });

  it('REGRESSION: the commitment per RTI partner matches the supply lines, also for an IF run by two companies', async () => {
    await carica(sintetico());
    const d = await getDashboardData(2026);
    const mio = d.interventi.filter((i) => ['20260001', '20260002', '20260003'].includes(i.numero_if));
    const perPartner = sumByPartner(mio, d.rti, d.quote_partner);
    // Intellera: IF1 1000 + 450 dell'IF2; Deloitte: 150 dell'IF2 + IF3 400,50.
    expect(perPartner.Intellera).toBeCloseTo(1450, 2);
    expect(perPartner.Deloitte).toBeCloseTo(550.5, 2);
    expect(somma(Object.values(perPartner))).toBeCloseTo(somma(mio.map((i) => i.importo)), 6);
    // Senza ripartizione l'IF misto finiva tutto su un'unica azienda.
    expect(sumByPartner(mio, d.rti).Intellera).toBeCloseTo(1600, 2);
  });
});

describe('Aggregatore: IF dell\'app assenti dal file', () => {
  const ID_FILE = ['20260001', '20260002', '20260003'];

  it('REGRESSION: stale IFs keep inflating the totals unless the upload archives them', async () => {
    const body = await carica(sintetico(), undefined, '?force=true');
    // Il portafoglio di base contiene IF che il file non ha: sono segnalati ma restano.
    expect((body.absent_ifs as string[]).length).toBeGreaterThan(0);
    expect(body.archived_ifs).toEqual([]);
    const d = await getDashboardData(2026);
    expect(d.interventi.length).toBeGreaterThan(ID_FILE.length);
  });

  it('with sync=true the dashboard holds exactly the IFs of the file, and the total is the file total', async () => {
    const body = await carica(sintetico(), undefined, '?force=true&sync=true');
    expect((body.archived_ifs as string[]).length).toBe((body.absent_ifs as string[]).length);
    const d = await getDashboardData(2026);
    expect(d.interventi.map((i) => i.numero_if).sort()).toEqual(ID_FILE);
    expect(d.kpi.count).toBe(3);
    expect(d.kpi.totale).toBeCloseTo(2000.5, 2);
    expect(impegnatoDi(d)).toBeCloseTo(2000.5, 2);
  });

  it('keeps manually edited IFs without force, and archives them with force', async () => {
    await createIntervento({ numero_if: 'MANUALE', titolo: 'Inserito a mano', importo: 77 });
    const soft = await carica(sintetico(), undefined, '?sync=true');
    expect(soft.absent_preserved_ifs).toContain('MANUALE');
    expect((await getDashboardData(2026)).interventi.some((i) => i.numero_if === 'MANUALE')).toBe(true);
    await carica(sintetico(), undefined, '?force=true&sync=true');
    expect((await getDashboardData(2026)).interventi.some((i) => i.numero_if === 'MANUALE')).toBe(false);
  });

  it('only an Aggregatore file can archive: another kind never reports or removes IFs', async () => {
    const iff = { numero_if: '20269999', titolo: 'IF', fornitore: 'Intellera', importo: 1 };
    const res = await POST(
      new Request('http://localhost/api/upload?sync=true', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'if', interventi: [iff] }),
      }),
    );
    const body = (await res.json()) as Record<string, unknown>;
    expect(res.status).toBe(200);
    expect(body.absent_ifs).toEqual([]);
    expect((await getDashboardData(2026)).interventi.length).toBeGreaterThan(1);
  });
});

// Verifica opzionale sul file reale (dati di contratto: non è nel repository).
//   AGGREGATORE_FILE=/percorso/Aggregatore.xlsm npx vitest run tests/aggregatoreImport.test.ts
const FILE_REALE = process.env.AGGREGATORE_FILE;
const CANONICO: [RegExp, string][] = [
  [/intellera/i, 'Intellera'],
  [/deloitte/i, 'Deloitte'],
  [/accenture/i, 'Accenture'],
  [/p\.?g\.?m\.?d/i, 'PGMD'],
  [/gellify/i, 'Gellify'],
];

function quadroConfig(buf: Buffer): { totale: number; perPartner: Record<string, number> } {
  const wb = XLSX.read(buf, { type: 'buffer' });
  const m = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets['Config'], { header: 1, defval: null, raw: true }) as unknown[][];
  const perPartner: Record<string, number> = {};
  let totale = 0;
  for (const r of m) {
    const nome = String(r[4] ?? '');
    const importo = Number(r[5]);
    if (nome === 'Totale impegnato') totale = importo;
    const hit = CANONICO.find(([re]) => re.test(nome));
    if (hit && Number.isFinite(importo)) perPartner[hit[1]] = importo;
  }
  return { totale, perPartner };
}

describe.skipIf(!FILE_REALE)('Aggregatore reale: i numeri dell\'app coincidono con quelli del file', () => {
  it('imports the file and reconciles totals, partners and costs with the Config sheet', async () => {
    const buf = readFileSync(FILE_REALE as string);
    const body = await carica(buf, undefined, '?force=true&sync=true');
    expect(body.ok).toBe(true);
    const d = await getDashboardData(2026);
    const quadro = quadroConfig(buf);
    // Con la sincronizzazione il portafoglio è esattamente quello del file: stesso totale ovunque.
    expect(Math.abs(d.kpi.totale - quadro.totale)).toBeLessThan(0.5);
    expect(Math.abs(impegnatoDi(d) - quadro.totale)).toBeLessThan(0.5);
    // Il portafoglio di base in memoria contiene altri IF: si confronta solo ciò che il file contiene.
    const nelFile = new Set((parseFile('Aggregatore.xlsm', buf).interventi ?? []).map((i) => i.numero_if));
    const mio = d.interventi.filter((i) => nelFile.has(i.numero_if));
    expect(mio).toHaveLength(nelFile.size);

    // Totale impegnato: Σ importi degli IF = Σ costi di fornitura = totale del file (tolleranza di centesimi).
    expect(Math.abs(somma(mio.map((i) => i.importo)) - quadro.totale)).toBeLessThan(0.5);

    // Impegnato per partner: righe di fornitura, non il solo fornitore dell'IF.
    const perPartner = sumByPartner(mio, d.rti, d.quote_partner);
    for (const [nome, atteso] of Object.entries(quadro.perPartner)) {
      if (perPartner[nome] == null) continue;
      expect(Math.abs(perPartner[nome] - atteso), nome).toBeLessThan(0.5);
    }

    // Generalità contro Oggetto Fornitura: nessuna discrepanza.
    const generalitaFornitura = d.controlli.esiti.filter((e) => e.confronto === 'gen_forn' && nelFile.has(e.numero_if));
    expect(generalitaFornitura).toHaveLength(nelFile.size);
    expect(conta(generalitaFornitura).discrepanza).toBe(0);
    expect(d.controlli.errore).toBeNull();
  });
});
