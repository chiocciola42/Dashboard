// Foglio "Oggetto Fornitura" dell'Aggregatore: costo contrattuale per linea di fornitura.
// Parser puro: nessun accesso a DB o rete.
import type { FornituraRiga, GdlTipo } from '../types';
import { findSheet, looseGetter, partnerName, sheetRows, str, strId, toNumber, type Workbook } from './util';

export const FORNITURA_SHEET = 'Oggetto Fornitura';
// Limite d'ingresso: oltre questa dimensione il foglio è anomalo e l'import fallisce in modo
// esplicito invece di lavorare su una quantità non prevista di righe.
export const MAX_FORNITURA_ROWS = 20_000;
const MAX_TEXT = 500;

// "A_corpo", "A corpo", "a canone"… -> tipo di fornitura; qualsiasi altro valore è null.
export function modalitaFromCell(v: unknown): GdlTipo | null {
  const s = str(v)?.toLowerCase().replace(/[_\s]+/g, ' ');
  if (!s) return null;
  if (s.includes('corpo')) return 'corpo';
  if (s.includes('canone')) return 'canone';
  if (s.includes('consumo')) return 'consumo';
  return null;
}

// Importo/quantità di una cella: numero finito, oppure null se vuota o non numerica. Un valore
// illeggibile non diventa mai 0: la riga resta, ma segnalata come "senza costo".
export function numberOrNull(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  if (!/\d/.test(s)) return null;
  const n = toNumber(s);
  return Number.isFinite(n) ? n : null;
}

const text = (v: unknown): string | null => {
  const s = str(v);
  return s ? s.slice(0, MAX_TEXT) : null;
};

function rowToFornitura(r: Record<string, unknown>): FornituraRiga | null {
  const g = looseGetter(r);
  const numero_if = strId(g('Numero IF'));
  if (!numero_if) return null;
  const fornitore = g('Fornitore');
  return {
    numero_if,
    num_linea: strId(g('Num Linea')),
    modalita: modalitaFromCell(g('Modalità Fornitura', 'Modalita Fornitura')),
    codice: text(g('Cod. Milestone / Attività', 'Cod Milestone Attivita')),
    descrizione: text(g('Descrizione Prestazione', 'Descrizione Milestone')),
    quantita: numberOrNull(g('Quantità', 'Quantita')),
    costo_unitario: numberOrNull(g('Costo Unitario')),
    costo_complessivo: numberOrNull(g('Costo Complessivo')),
    fornitore: partnerName(fornitore) ?? text(fornitore),
  };
}

// Righe del foglio già lette come oggetti. Una riga senza IF non è attribuibile e viene scartata;
// le altre (anche senza costo) sono conservate.
export function parseFornituraRows(rows: Record<string, unknown>[]): FornituraRiga[] {
  if (rows.length > MAX_FORNITURA_ROWS) {
    throw new Error(`Oggetto Fornitura: ${rows.length} righe, massimo ${MAX_FORNITURA_ROWS}`);
  }
  const out: FornituraRiga[] = [];
  for (const r of rows) {
    const riga = rowToFornitura(r);
    if (riga) out.push(riga);
  }
  return out;
}

export function parseFornitura(wb: Workbook): FornituraRiga[] {
  const sheet = findSheet(wb, FORNITURA_SHEET, 'Oggetto');
  if (!sheet) return [];
  return parseFornituraRows(sheetRows(wb, sheet, 0));
}
