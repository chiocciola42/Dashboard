// Pure logic behind the "Dettaglio IF" panel: filtering, sorting, the Excel/CSV
// export shape and the helpers of the monthly PDC / SAL / BEF detail.
import type { DocStatus, Intervento, ReportPdcRecord, VerbaleSalRecord, BefRow } from './types';
import { dfmt, ICO } from './format';
import type { Matrix } from './exportTable';
import { compareBy, eurPlain, matchesFields, toCsv, type SortKey } from './ifTable';

export { eurPlain, type SortKey };

export type MonthlyData = { pdc: ReportPdcRecord[]; sal: VerbaleSalRecord[]; bef: BefRow[] };
export type MonthlyState = MonthlyData | 'loading' | 'error';

// Column order of the table (and of the export): [sort key, header label].
export const DETTAGLIO_COLS: [SortKey, string][] = [
  ['ambito', 'Ambito'],
  ['numero_if', 'N° IF'],
  ['bdo', 'N° BO'],
  ['titolo', 'Titolo Intervento'],
  ['data_inizio', 'Data Inizio'],
  ['data_fine', 'Data Fine'],
  ['ref_aria', 'Ref. ARIA'],
  ['ref_fornitore', 'Ref. Fornitore'],
  ['fornitore', 'Fornitore'],
  ['importo', 'Importo (€)'],
  ['modalita_if', 'Modalità'],
  ['has_bo', 'Stato BO'],
  ['pdc', 'PDC'],
  ['v_apertura', 'V. Apertura'],
  ['v_sal', 'V. SAL'],
  ['bef', 'BEF'],
  ['azione', 'Azione Richiesta'],
];

export const DOC_KEYS = ['pdc', 'v_apertura', 'v_sal', 'bef'] as const;
export type DocKey = (typeof DOC_KEYS)[number];
export const DOC_LABELS: Record<DocKey, string> = { pdc: 'PDC', v_apertura: 'V. Apertura', v_sal: 'V. SAL', bef: 'BEF' };

// Free-text stato (PDC/SAL) -> traffic-light color. These fields come from
// the source exports as free text ("PDC Approvata", "Verbale Conforme", …),
// not the fixed DocStatus enum, so match on keywords instead.
export function statusColor(s: string | null): string {
  const t = (s || '').toLowerCase();
  if (!t) return 'var(--slate-l)';
  if (/(assente|mancante|non conforme|rifiutat)/.test(t)) return 'var(--bad)';
  if (/(approvat|conforme|^ok$|firmat)/.test(t)) return 'var(--good)';
  return 'var(--amber-d)';
}

// "MM/YYYY" -> sortable key (blank/unparsable periods sort last).
export function periodKey(p: string | null): number {
  const m = (p || '').match(/^(\d{1,2})\/(\d{4})$/);
  return m ? Number(m[2]) * 100 + Number(m[1]) : Infinity;
}

// Copy of `rows` ordered by period (never mutates the input).
export function sortByPeriod<T>(rows: T[], period: (r: T) => string | null): T[] {
  return [...rows].sort((a, b) => periodKey(period(a)) - periodKey(period(b)));
}

export const docLabel = (v: DocStatus) => ICO[v][1];

export const pdcMatrix = (pdc: ReportPdcRecord[]): Matrix | null =>
  pdc.length
    ? [['Periodo', 'Stato', 'Codice'], ...pdc.map((r) => [r.periodo_pdc || '', r.stato_pdc || '', r.codice_pdc || ''])]
    : null;

export const salMatrix = (sal: VerbaleSalRecord[]): Matrix | null =>
  sal.length
    ? [['Periodo', 'Stato verbale', 'Conforme'], ...sal.map((r) => [r.periodo_competenza || '', r.stato_verbale || '', r.conforme || ''])]
    : null;

export const befMatrix = (bef: BefRow[]): Matrix | null =>
  bef.length
    ? [
        ['Periodo', 'Importo', 'Fattura'],
        ...bef.map((r) => [
          r.periodo_competenza || '',
          r.importo_ricezione != null ? eurPlain(r.importo_ricezione) : '',
          r.num_fattura || 'fatturabile',
        ]),
      ]
    : null;

// Intestazioni e righe condivise fra l'export CSV e la copia per Excel.
export const EXPORT_HEAD = [
  'Ambito', 'N° IF', 'N° BO', 'Titolo Intervento', 'Data Inizio', 'Data Fine', 'Ref. ARIA', 'Ref. Fornitore',
  'Fornitore', 'Importo (€)', 'Modalità', 'Stato BO', 'PDC', 'V. Apertura', 'V. SAL', 'BEF', 'Azione Richiesta',
];

export function exportRow(x: Intervento): (string | number)[] {
  return [
    x.ambito || '', x.numero_if, x.bdo || '', x.titolo, dfmt(x.data_inizio), dfmt(x.data_fine), x.ref_aria || '',
    x.ref_fornitore || '', x.fornitore, eurPlain(x.importo), x.modalita_if || '', x.has_bo ? 'BO emesso' : 'In attesa',
    docLabel(x.pdc), docLabel(x.v_apertura), docLabel(x.v_sal), docLabel(x.bef), x.azione || '',
  ];
}

export function exportMatrix(IFs: Intervento[]): Matrix {
  return [EXPORT_HEAD, ...IFs.map(exportRow)];
}

// CSV text of the shown IFs (see toCsv for the format).
export const buildCsv = (IFs: Intervento[]): string => toCsv([EXPORT_HEAD, ...IFs.map(exportRow)]);

const SEARCH_FIELDS: (keyof Intervento)[] = ['numero_if', 'bdo', 'titolo', 'ambito', 'ref_aria', 'ref_fornitore', 'fornitore', 'modalita_if', 'azione'];

// Free-text search over the main text fields; empty query keeps everything.
export const matchesQuery = (x: Intervento, rawQuery: string): boolean => matchesFields(x, rawQuery, SEARCH_FIELDS);

// Filtered, sorted copy of the portfolio (the input is not mutated).
export function filterAndSort(IFs: Intervento[], query: string, sortK: SortKey, sortDir: number): Intervento[] {
  return IFs.filter((x) => matchesQuery(x, query)).sort(compareBy(sortK, sortDir, ['importo']));
}

// Clicking a header: same column flips direction; a new column starts
// ascending, except the amount which starts descending.
export function nextSort(cur: { key: SortKey; dir: number }, clicked: SortKey): { key: SortKey; dir: number } {
  if (cur.key === clicked) return { key: cur.key, dir: cur.dir * -1 };
  return { key: clicked, dir: clicked === 'importo' ? -1 : 1 };
}
