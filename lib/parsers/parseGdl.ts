// Foglio "GdL - Gruppo di Lavoro" dell'Aggregatore: giornate reali per IF, attività,
// figura professionale e risorsa. Parser puro: nessun accesso a DB o rete.
import type { GdlRiga, GdlTipo } from '../types';
import { findSheet, looseGetter, partnerName, sheetRows, str, strId, toNumber, type Workbook } from './util';

export const GDL_SHEET = 'GdL - Gruppo di Lavoro';
// Limite d'ingresso: oltre questa dimensione il foglio è anomalo e l'import fallisce
// in modo esplicito invece di lavorare su una quantità non prevista di righe.
export const MAX_GDL_ROWS = 20_000;
const MAX_TEXT = 500;

const PREFIX_TIPO: readonly [RegExp, GdlTipo][] = [
  [/^MLS/i, 'corpo'],
  [/^CAN/i, 'canone'],
  [/^CONS/i, 'consumo'],
];

// Tipo di fornitura dedotto dal prefisso del codice attività (null se non riconosciuto).
export function tipoFromCodice(codice: string | null): GdlTipo | null {
  if (!codice) return null;
  const hit = PREFIX_TIPO.find(([re]) => re.test(codice));
  return hit ? hit[1] : null;
}

const TIPO_LABEL: Record<GdlTipo, string> = { corpo: 'A corpo', canone: 'A canone', consumo: 'A consumo' };
const TIPO_ORDER: readonly GdlTipo[] = ['corpo', 'canone', 'consumo'];

// Modalità di fornitura di ogni IF dedotta dai codici del GdL (MLS = a corpo, CAN = a canone,
// CONS = a consumo). Un IF con più tipi ottiene la loro combinazione ("A corpo + A canone").
// Gli IF senza alcun codice riconosciuto non compaiono nella mappa.
export function modalitaFromGdl(rows: readonly GdlRiga[]): Map<string, string> {
  const tipi = new Map<string, Set<GdlTipo>>();
  for (const r of rows) {
    if (!r.tipo) continue;
    tipi.set(r.numero_if, (tipi.get(r.numero_if) ?? new Set<GdlTipo>()).add(r.tipo));
  }
  const out = new Map<string, string>();
  for (const [numeroIf, set] of tipi) {
    out.set(numeroIf, TIPO_ORDER.filter((t) => set.has(t)).map((t) => TIPO_LABEL[t]).join(' + '));
  }
  return out;
}

// Giornate di una cella: numero >= 0, oppure null se vuota, non numerica o negativa.
// Un valore illeggibile non diventa mai 0: la riga resta, ma segnalata come "senza GG".
export function ggFromCell(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? v : null;
  const s = String(v).trim();
  if (!/\d/.test(s)) return null;
  const n = toNumber(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

const text = (v: unknown): string | null => {
  const s = str(v);
  return s ? s.slice(0, MAX_TEXT) : null;
};

function rowToGdl(r: Record<string, unknown>): GdlRiga | null {
  const g = looseGetter(r);
  const numero_if = strId(g('Numero IF'));
  const figura = text(g('Figure Professionali', 'Figura Professionale'));
  if (!numero_if || !figura) return null;
  const codice = text(g('Cod. Milestone / Attività', 'Cod Milestone Attivita'));
  const azienda = g('Azienda di Appartenenza', 'Azienda');
  return {
    numero_if,
    codice,
    tipo: tipoFromCodice(codice),
    descrizione: text(g('Descrizione Milestone', 'Descrizione')),
    figura,
    nome_risorsa: text(g('Nome Risorsa')),
    gg: ggFromCell(g('GG / Uomo', 'GG Uomo')),
    azienda: partnerName(azienda) ?? text(azienda),
  };
}

// Righe del foglio già lette come oggetti. Le righe senza IF o senza figura non sono
// attribuibili e vengono scartate; tutte le altre (anche senza GG) sono conservate.
export function parseGdlRows(rows: Record<string, unknown>[]): GdlRiga[] {
  if (rows.length > MAX_GDL_ROWS) {
    throw new Error(`GdL: ${rows.length} righe, massimo ${MAX_GDL_ROWS}`);
  }
  const out: GdlRiga[] = [];
  for (const r of rows) {
    const riga = rowToGdl(r);
    if (riga) out.push(riga);
  }
  return out;
}

export function parseGdl(wb: Workbook): GdlRiga[] {
  const sheet = findSheet(wb, GDL_SHEET, 'GdL');
  if (!sheet) return [];
  return parseGdlRows(sheetRows(wb, sheet, 0));
}
