import { inArray } from 'drizzle-orm';
import type { RunnableQuery } from 'drizzle-orm/runnable-query';
import { getDb, hasDB, ensureSchema } from './db';
import { fornitura_righe } from './schema';
import { MAX_FORNITURA_ROWS } from './parsers/parseFornitura';
import type { FornituraRiga, GdlTipo } from './types';

// Costi contrattuali per linea di fornitura (foglio "Oggetto Fornitura" dell'Aggregatore). DB-backed
// con fallback in memoria, come gli altri store.
//
// Il foglio è uno SNAPSHOT completo per IF: per ogni IF presente in un upload le righe caricate
// sostituiscono integralmente quelle già salvate; gli IF non citati restano intatti.

type BatchItem = RunnableQuery<unknown, 'pg'>;

const INSERT_CHUNK = 500; // 9 colonne x 500 righe = 4.500 parametri per statement
const MAX_IFS = 5_000;

const g = globalThis as unknown as { __ARIA_FORN__?: Record<string, FornituraRiga[]> };
function mem(): Record<string, FornituraRiga[]> {
  if (!g.__ARIA_FORN__) g.__ARIA_FORN__ = {};
  return g.__ARIA_FORN__;
}

const TIPI: readonly string[] = ['corpo', 'canone', 'consumo'];
const tipoOrNull = (v: string | null): GdlTipo | null => (v && TIPI.includes(v) ? (v as GdlTipo) : null);
const numOrNull = (v: string | null): number | null => (v == null ? null : Number(v));
const strOrNull = (v: number | null): string | null => (v == null ? null : String(v));

type Row = typeof fornitura_righe.$inferSelect;
function rowTo(r: Row): FornituraRiga {
  return {
    numero_if: r.numero_if,
    num_linea: r.num_linea,
    modalita: tipoOrNull(r.modalita),
    codice: r.codice,
    descrizione: r.descrizione,
    quantita: numOrNull(r.quantita),
    costo_unitario: numOrNull(r.costo_unitario),
    costo_complessivo: numOrNull(r.costo_complessivo),
    fornitore: r.fornitore,
  };
}

const toInsertRow = (r: FornituraRiga) => ({
  numero_if: r.numero_if,
  num_linea: r.num_linea,
  modalita: r.modalita,
  codice: r.codice,
  descrizione: r.descrizione,
  quantita: strOrNull(r.quantita),
  costo_unitario: strOrNull(r.costo_unitario),
  costo_complessivo: strOrNull(r.costo_complessivo),
  fornitore: r.fornitore,
});

// Validazione all'ingresso: limiti dimostrabili e dati usabili, altrimenti errore esplicito.
function assertValid(rows: readonly FornituraRiga[]): void {
  if (rows.length > MAX_FORNITURA_ROWS) throw new Error(`Fornitura: ${rows.length} righe, massimo ${MAX_FORNITURA_ROWS}`);
  for (const r of rows) {
    if (!r.numero_if) throw new Error('Fornitura: riga senza numero IF');
    for (const v of [r.quantita, r.costo_unitario, r.costo_complessivo]) {
      if (v != null && !Number.isFinite(v)) throw new Error(`Fornitura: valore non valido (${v})`);
    }
  }
}

function groupByIf(rows: readonly FornituraRiga[]): Map<string, FornituraRiga[]> {
  const byIf = new Map<string, FornituraRiga[]>();
  for (const r of rows) byIf.set(r.numero_if, [...(byIf.get(r.numero_if) ?? []), r]);
  return byIf;
}

export async function listAllFornitura(): Promise<FornituraRiga[]> {
  if (!hasDB) return Object.values(mem()).flat().map((r) => ({ ...r }));
  await ensureSchema();
  const rows = await getDb().select().from(fornitura_righe).orderBy(fornitura_righe.id);
  return rows.map(rowTo);
}

// Sostituisce le righe di tutti gli IF presenti in `rows`. Una sola transazione: o si applica tutto
// o niente (db.batch() è transazionale lato Neon).
export async function persistFornituraFromUpload(rows: readonly FornituraRiga[]): Promise<{ saved: number; ifs: string[] }> {
  assertValid(rows);
  const byIf = groupByIf(rows);
  if (byIf.size === 0) return { saved: 0, ifs: [] };
  if (byIf.size > MAX_IFS) throw new Error(`Fornitura: ${byIf.size} IF, massimo ${MAX_IFS}`);
  const ifs = [...byIf.keys()];

  if (!hasDB) {
    for (const [numeroIf, list] of byIf) mem()[numeroIf] = list.map((r) => ({ ...r }));
    return { saved: rows.length, ifs };
  }

  await ensureSchema();
  const db = getDb();
  const statements: BatchItem[] = [db.delete(fornitura_righe).where(inArray(fornitura_righe.numero_if, ifs))];
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    statements.push(db.insert(fornitura_righe).values(rows.slice(i, i + INSERT_CHUNK).map(toInsertRow)));
  }
  await db.batch(statements as [BatchItem, ...BatchItem[]]);
  return { saved: rows.length, ifs };
}
