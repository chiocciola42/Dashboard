// Helpers shared by the two IF tables ("Operativo" and "Dettaglio IF"): text
// search, column comparator and the CSV text format.
import type { Intervento } from './types';

export type SortKey = keyof Intervento;

// Case-insensitive substring search over the given fields; blank query = match.
export function matchesFields(x: Intervento, rawQuery: string, fields: (keyof Intervento)[]): boolean {
  const query = rawQuery.toLowerCase().trim();
  if (!query) return true;
  return fields
    .map((f) => x[f])
    .join(' ')
    .toLowerCase()
    .includes(query);
}

// Comparator for one column: numeric columns compare as numbers (NaN -> 0),
// everything else as lowercase text (null -> ''). `sortDir` is 1 or -1.
export function compareBy(sortK: SortKey, sortDir: number, numericKeys: readonly SortKey[]) {
  const numeric = numericKeys.includes(sortK);
  return (a: Intervento, b: Intervento): number => {
    let va: string | number = a[sortK] as never;
    let vb: string | number = b[sortK] as never;
    if (numeric) {
      va = Number(va) || 0;
      vb = Number(vb) || 0;
    } else {
      va = (va == null ? '' : String(va)).toLowerCase();
      vb = (vb == null ? '' : String(vb)).toLowerCase();
    }
    return va < vb ? -sortDir : va > vb ? sortDir : 0;
  };
}

// Per Excel i decimali vanno separati dalla virgola (locale it-IT) e senza
// separatore di migliaia, altrimenti la cella resta testo.
export const eurPlain = (n: number): string => Number(n || 0).toFixed(2).replace('.', ',');

// Semicolon-separated, every cell quoted (quotes doubled), CRLF line ends, UTF-8
// BOM so Excel opens it with the right encoding.
export function toCsv(rows: (string | number)[][]): string {
  const body = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  return '﻿' + body;
}
