import { inArray } from 'drizzle-orm';
import type { RunnableQuery } from 'drizzle-orm/runnable-query';
import { getDb, hasDB, ensureSchema } from './db';
import { gdl_righe } from './schema';
import { MAX_GDL_ROWS } from './parsers/parseGdl';
import type { GdlRiga, GdlTipo } from './types';

// Giornate reali per IF (foglio "GdL - Gruppo di Lavoro" dell'Aggregatore). DB-backed con
// fallback in memoria, come gli altri store.
//
// Il foglio è uno SNAPSHOT completo per IF: per ogni IF presente in un upload le righe
// caricate sostituiscono integralmente quelle già salvate; gli IF non citati restano intatti.
// Righe identiche della stessa figura sono persone diverse: non si deduplica mai.

type BatchItem = RunnableQuery<unknown, 'pg'>;

const INSERT_CHUNK = 500; // 9 colonne x 500 righe = 4.500 parametri per statement
const MAX_IFS = 5_000;

const g = globalThis as unknown as { __ARIA_GDL__?: Record<string, GdlRiga[]> };
function mem(): Record<string, GdlRiga[]> {
  if (!g.__ARIA_GDL__) g.__ARIA_GDL__ = {};
  return g.__ARIA_GDL__;
}

const TIPI: readonly string[] = ['corpo', 'canone', 'consumo'];
const tipoOrNull = (v: string | null): GdlTipo | null => (v && TIPI.includes(v) ? (v as GdlTipo) : null);

type Row = typeof gdl_righe.$inferSelect;
function rowTo(r: Row): GdlRiga {
  return {
    numero_if: r.numero_if,
    codice: r.codice,
    tipo: tipoOrNull(r.tipo),
    descrizione: r.descrizione,
    figura: r.figura,
    nome_risorsa: r.nome_risorsa,
    gg: r.gg == null ? null : Number(r.gg),
    azienda: r.azienda,
  };
}

const toInsertRow = (r: GdlRiga) => ({
  numero_if: r.numero_if,
  codice: r.codice,
  tipo: r.tipo,
  descrizione: r.descrizione,
  figura: r.figura,
  nome_risorsa: r.nome_risorsa,
  gg: r.gg == null ? null : String(r.gg),
  azienda: r.azienda,
});

// Validazione all'ingresso: limiti dimostrabili e dati usabili, altrimenti errore esplicito.
function assertValid(rows: readonly GdlRiga[]): void {
  if (rows.length > MAX_GDL_ROWS) throw new Error(`GdL: ${rows.length} righe, massimo ${MAX_GDL_ROWS}`);
  for (const r of rows) {
    if (!r.numero_if) throw new Error('GdL: riga senza numero IF');
    if (r.gg != null && !(Number.isFinite(r.gg) && r.gg >= 0)) throw new Error(`GdL: GG non valido (${r.gg})`);
  }
}

function groupByIf(rows: readonly GdlRiga[]): Map<string, GdlRiga[]> {
  const byIf = new Map<string, GdlRiga[]>();
  for (const r of rows) byIf.set(r.numero_if, [...(byIf.get(r.numero_if) ?? []), r]);
  return byIf;
}

export async function listAllGdl(): Promise<GdlRiga[]> {
  if (!hasDB) return Object.values(mem()).flat().map((r) => ({ ...r }));
  await ensureSchema();
  const rows = await getDb().select().from(gdl_righe).orderBy(gdl_righe.id);
  return rows.map(rowTo);
}

export async function listGdl(numeroIf: string): Promise<GdlRiga[]> {
  return (await listAllGdl()).filter((r) => r.numero_if === numeroIf);
}

// Sostituisce le righe di tutti gli IF presenti in `rows`. Una sola transazione: o si applica
// tutto o niente (db.batch() è transazionale lato Neon).
export async function persistGdlFromUpload(rows: readonly GdlRiga[]): Promise<{ saved: number; ifs: string[] }> {
  assertValid(rows);
  const byIf = groupByIf(rows);
  if (byIf.size === 0) return { saved: 0, ifs: [] };
  if (byIf.size > MAX_IFS) throw new Error(`GdL: ${byIf.size} IF, massimo ${MAX_IFS}`);
  const ifs = [...byIf.keys()];

  if (!hasDB) {
    for (const [numeroIf, list] of byIf) mem()[numeroIf] = list.map((r) => ({ ...r }));
    return { saved: rows.length, ifs };
  }

  await ensureSchema();
  const db = getDb();
  const statements: BatchItem[] = [db.delete(gdl_righe).where(inArray(gdl_righe.numero_if, ifs))];
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    statements.push(db.insert(gdl_righe).values(rows.slice(i, i + INSERT_CHUNK).map(toInsertRow)));
  }
  await db.batch(statements as [BatchItem, ...BatchItem[]]);
  return { saved: rows.length, ifs };
}
