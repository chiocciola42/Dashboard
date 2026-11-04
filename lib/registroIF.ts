// Pure logic behind the "Operativo" (Registro IF) panel: search / sort, paging
// and the Excel / CSV export shape.
import type { DocStatus, Intervento } from './types';
import type { Matrix } from './exportTable';
import { compareBy, eurPlain, matchesFields, toCsv, type SortKey } from './ifTable';

export type { SortKey };

// Righe renderizzate per volta: con migliaia di IF il DOM completo rallenta
// ordinamento e digitazione. Export e totali usano sempre tutte le righe.
export const REGISTRO_PAGE = 200;

export const ST_TXT: Record<DocStatus, string> = { ok: 'OK', ko: 'Mancante', prog: 'In corso', nd: 'N/D' };

// Columns of the table: [sort key, header label].
export const REGISTRO_COLS: [SortKey, string][] = [
  ['numero_if', 'IF'],
  ['bdo', 'N° BO'],
  ['titolo', 'Intervento / Referente'],
  ['modalita_if', 'Modalità'],
  ['attivazione', 'Att.imm.'],
  ['stato', 'Stato BO'],
  ['pdc', 'PDC'],
  ['v_apertura', 'V.Ap.'],
  ['v_sal', 'V.SAL'],
  ['bef', 'BEF'],
  ['data_inizio', 'Inizio'],
  ['data_fine', 'Fine'],
  ['importo', 'Importo €'],
];

const NUMERIC_KEYS: SortKey[] = ['importo', 'revenue_anno'];
const SEARCH_FIELDS: (keyof Intervento)[] = ['numero_if', 'titolo', 'ref_aria', 'ref_fornitore', 'ambito', 'bdo', 'stato', 'modalita_if'];

export const isNumericKey = (k: SortKey): boolean => NUMERIC_KEYS.includes(k);

// Intestazioni e righe condivise fra l'export CSV e la copia per Excel: una
// sola definizione delle colonne, così i due export non divergono.
export const exportHead = (anno: number): string[] => [
  'Numero IF', 'BDO', 'Titolo', 'Ambito', 'Fornitore', 'Referente ARIA', 'Referente Intellera',
  'Modalità', 'Attivazione immediata', 'Stato', 'Data assegnazione', 'Data inizio', 'Data fine',
  'PDC', 'V. Apertura', 'V. SAL', 'BEF', 'Importo', `Revenue ${anno}`, 'Subappalto',
];

export function exportRow(x: Intervento, eur: (n: number) => string = eurPlain): (string | number)[] {
  return [
    x.numero_if, x.bdo || '', x.titolo, x.ambito || '', x.fornitore, x.ref_aria || '', x.ref_fornitore || '',
    x.modalita_if || '', x.attivazione || '', x.stato, x.data_assegnazione || '', x.data_inizio || '', x.data_fine || '',
    ST_TXT[x.pdc], ST_TXT[x.v_apertura], ST_TXT[x.v_sal], ST_TXT[x.bef], eur(x.importo), eur(x.revenue_anno),
    x.subappalto ? 'Sì' : 'No',
  ];
}

// The matrix behind "Copia per Excel" (header + one row per IF).
export function exportMatrix(IFs: Intervento[], anno: number): Matrix {
  return [exportHead(anno), ...IFs.map((x) => exportRow(x))];
}

// CSV of the IFs exactly as shown: they arrive already filtered / sorted, so
// they are exported as-is instead of being re-sorted.
export const buildRegistroCsv = (IFs: Intervento[], anno: number): string =>
  toCsv([exportHead(anno), ...IFs.map((x) => exportRow(x))]);

// Filtered, sorted copy of the portfolio (the input is not mutated).
export function filterAndSortRegistro(IFs: Intervento[], query: string, sortK: SortKey, sortDir: number): Intervento[] {
  return IFs.filter((x) => matchesFields(x, query, SEARCH_FIELDS)).sort(compareBy(sortK, sortDir, NUMERIC_KEYS));
}

// Clicking a header: same column flips direction; a new column starts
// ascending, except the numeric ones which start descending.
export function nextRegistroSort(cur: { key: SortKey; dir: number }, clicked: SortKey): { key: SortKey; dir: number } {
  if (cur.key === clicked) return { key: cur.key, dir: cur.dir * -1 };
  return { key: clicked, dir: isNumericKey(clicked) ? -1 : 1 };
}

// Identity of the current view: the page limit resets whenever it changes.
export const registroViewKey = (query: string, sortK: SortKey, sortDir: number, total: number): string =>
  `${query}|${sortK}|${sortDir}|${total}`;

// How many rows to show: the stored limit only counts for the same view.
export const visibleCount = (shown: { key: string; n: number }, viewKey: string): number =>
  shown.key === viewKey ? shown.n : REGISTRO_PAGE;
