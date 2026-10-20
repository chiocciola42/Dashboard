import { createHash } from 'node:crypto';
import { inArray, sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as s from './schema';
import {
  parseSapFile,
  resolveContrattoPerBdo,
  type BefRow,
  type ParsedSap,
  type PdcRow,
  type SapKind,
  type VerbaleRow,
} from './parsers/sap';

export type Db = PgDatabase<PgQueryResultHKT, typeof s>;

export type ImportSummary = {
  tipo: SapKind | 'if';
  righe_lette: number;
  bdo: number;
  contratti: number;
  fornitori: number;
  note?: string;
};

const CHUNK = 500;
function* chunks<T>(arr: T[], n = CHUNK): Generator<T[]> {
  for (let i = 0; i < arr.length; i += n) yield arr.slice(i, i + n);
}
const clean = (v: string | null | undefined) => (v ?? '').replace(/\s+/g, ' ').trim();
const money = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? null : n.toFixed(4));

async function ensureNamed(
  db: Db,
  table: typeof s.fornitori | typeof s.contratti,
  names: string[],
): Promise<Map<string, number>> {
  const uniq = [...new Set(names.map(clean).filter(Boolean))];
  const col = table === s.contratti ? s.contratti.codice : s.fornitori.nome;
  const out = new Map<string, number>();
  for (const part of chunks(uniq)) {
    if (table === s.contratti) {
      await db.insert(s.contratti).values(part.map((codice) => ({ codice }))).onConflictDoNothing();
    } else {
      await db.insert(s.fornitori).values(part.map((nome) => ({ nome }))).onConflictDoNothing();
    }
    const rows = await db.select({ id: table.id, k: col }).from(table).where(inArray(col, part));
    for (const r of rows) out.set(r.k, r.id);
  }
  return out;
}

// Crea/aggiorna i BdO. Il contratto è un dato SAP: se la riga lo risolve
// sovrascrive il precedente, altrimenti quello esistente resta. Le note (dati
// applicativi) non vengono mai toccate.
async function upsertBdo(
  db: Db,
  bdos: Map<string, { contratto_id: number | null; descrizione: string | null }>,
): Promise<Map<string, number>> {
  const entries = [...bdos.entries()];
  const out = new Map<string, number>();
  for (const part of chunks(entries)) {
    await db
      .insert(s.buoni_ordine)
      .values(part.map(([numero_bdo, v]) => ({ numero_bdo, contratto_id: v.contratto_id, descrizione: v.descrizione })))
      .onConflictDoUpdate({
        target: s.buoni_ordine.numero_bdo,
        set: {
          contratto_id: sql`coalesce(excluded.contratto_id, ${s.buoni_ordine.contratto_id})`,
          descrizione: sql`coalesce(excluded.descrizione, ${s.buoni_ordine.descrizione})`,
          updated_at: sql`now()`,
        },
      });
    const rows = await db
      .select({ id: s.buoni_ordine.id, k: s.buoni_ordine.numero_bdo })
      .from(s.buoni_ordine)
      .where(inArray(s.buoni_ordine.numero_bdo, part.map(([k]) => k)));
    for (const r of rows) out.set(r.k, r.id);
  }
  return out;
}

async function linkContrattiFornitori(db: Db, pairs: [number, number][]) {
  const uniq = [...new Map(pairs.map((p) => [`${p[0]}|${p[1]}`, p])).values()];
  for (const part of chunks(uniq)) {
    await db
      .insert(s.contratti_fornitori)
      .values(part.map(([contratto_id, fornitore_id]) => ({ contratto_id, fornitore_id })))
      .onConflictDoNothing();
  }
}

// Un BdO è "validato" quando ha contratto e IF associata, altrimenti resta da
// riconciliare (vedi lib/domain/riconciliazione.ts).
export async function refreshStatoBdo(db: Db): Promise<void> {
  await db.execute(sql`
    update buoni_ordine set stato = case
      when contratto_id is not null
       and exists (select 1 from associazioni_bdo_if a where a.bdo_id = buoni_ordine.id)
      then 'validato' else 'da_riconciliare' end
    where stato is distinct from case
      when contratto_id is not null
       and exists (select 1 from associazioni_bdo_if a where a.bdo_id = buoni_ordine.id)
      then 'validato' else 'da_riconciliare' end`);
}

type Ctx = {
  bdoIds: Map<string, number>;
  fornitoreIds: Map<string, number>;
  contrattoIds: Map<string, number>;
};

// Anagrafiche comuni a tutti gli import: contratti, fornitori, BdO e legami
// contratto–fornitore.
async function prepare(
  db: Db,
  rows: { bdo: string; contratto?: string | null; fornitore: string | null; descrizione?: string | null }[],
  contrattoByBdo: Map<string, string>,
): Promise<Ctx> {
  const contrattoIds = await ensureNamed(db, s.contratti, [...contrattoByBdo.values()]);
  const fornitoreIds = await ensureNamed(db, s.fornitori, rows.map((r) => r.fornitore ?? ''));
  const bdos = new Map<string, { contratto_id: number | null; descrizione: string | null }>();
  for (const r of rows) {
    const cur = bdos.get(r.bdo);
    const c = contrattoByBdo.get(r.bdo);
    bdos.set(r.bdo, {
      contratto_id: c ? contrattoIds.get(clean(c)) ?? null : null,
      descrizione: cur?.descrizione ?? (clean(r.descrizione) || null),
    });
  }
  const bdoIds = await upsertBdo(db, bdos);
  const pairs: [number, number][] = [];
  for (const r of rows) {
    const c = contrattoByBdo.get(r.bdo);
    const cid = c ? contrattoIds.get(clean(c)) : undefined;
    const fid = r.fornitore ? fornitoreIds.get(clean(r.fornitore)) : undefined;
    if (cid && fid) pairs.push([cid, fid]);
  }
  await linkContrattiFornitori(db, pairs);
  return { bdoIds, fornitoreIds, contrattoIds };
}

const fid = (ctx: Ctx, nome: string | null) => (nome ? ctx.fornitoreIds.get(clean(nome)) ?? null : null);

export async function importPdc(db: Db, rows: PdcRow[]): Promise<ImportSummary> {
  const ctx = await prepare(db, rows, resolveContrattoPerBdo([rows]));
  const ids = [...ctx.bdoIds.values()];
  for (const part of chunks(ids)) await db.delete(s.piani_consegna).where(inArray(s.piani_consegna.bdo_id, part));

  const piani = rows.map((r) => ({
    bdo_id: ctx.bdoIds.get(r.bdo)!,
    posizione: r.posizione,
    periodo: r.periodo,
    fornitore_id: fid(ctx, r.fornitore),
    codice_pdc: r.codice_pdc,
    prestazione: r.prestazione,
    stato: r.stato,
    importo: money(r.importo_avanzamento),
    data_approvazione: r.data_approvazione,
  }));
  for (const part of chunks(piani)) await db.insert(s.piani_consegna).values(part);

  // Posizione = valore d'ordine: "Importo Posizione" è ripetuto identico su ogni
  // riga della posizione (non è additivo), quindi si prende una volta sola.
  const pos = new Map<string, typeof s.posizioni_bdo.$inferInsert>();
  for (const r of rows) {
    const k = `${r.bdo}|${r.posizione}`;
    const cur = pos.get(k);
    const imp = r.importo_posizione ?? 0;
    if (!cur) {
      pos.set(k, {
        bdo_id: ctx.bdoIds.get(r.bdo)!,
        posizione: r.posizione,
        fornitore_id: fid(ctx, r.fornitore),
        descrizione: r.descrizione,
        importo: money(imp),
      });
    } else if (imp > Number(cur.importo ?? 0)) {
      cur.importo = money(imp);
    }
  }
  for (const part of chunks([...pos.values()])) {
    await db
      .insert(s.posizioni_bdo)
      .values(part)
      .onConflictDoUpdate({
        target: [s.posizioni_bdo.bdo_id, s.posizioni_bdo.posizione],
        set: {
          importo: sql`excluded.importo`,
          fornitore_id: sql`coalesce(excluded.fornitore_id, ${s.posizioni_bdo.fornitore_id})`,
          descrizione: sql`coalesce(excluded.descrizione, ${s.posizioni_bdo.descrizione})`,
        },
      });
  }
  await refreshStatoBdo(db);
  return { tipo: 'pdc', righe_lette: rows.length, bdo: ctx.bdoIds.size, contratti: ctx.contrattoIds.size, fornitori: ctx.fornitoreIds.size };
}

export async function importBef(db: Db, rows: BefRow[]): Promise<ImportSummary> {
  const ctx = await prepare(db, rows, resolveContrattoPerBdo([rows]));
  const ids = [...ctx.bdoIds.values()];

  // Rimpiazzo per BdO: le righe BEF non hanno chiave naturale garantita da SAP.
  for (const part of chunks(ids)) {
    const old = db.select({ id: s.benestari_fatturazione.id }).from(s.benestari_fatturazione).where(inArray(s.benestari_fatturazione.bdo_id, part));
    await db.delete(s.righe_bef).where(inArray(s.righe_bef.bef_id, old));
    await db.delete(s.benestari_fatturazione).where(inArray(s.benestari_fatturazione.bdo_id, part));
  }

  const bef = new Map<string, { bdo_id: number; numero_benestare: string; periodo: string | null; descrizione: string | null }>();
  for (const r of rows) {
    const bdo_id = ctx.bdoIds.get(r.bdo)!;
    const k = `${bdo_id}|${r.benestare}`;
    if (!bef.has(k)) bef.set(k, { bdo_id, numero_benestare: r.benestare, periodo: r.periodo, descrizione: r.descrizione });
  }
  const befIds = new Map<string, number>();
  for (const part of chunks([...bef.values()])) {
    const ins = await db.insert(s.benestari_fatturazione).values(part).returning({
      id: s.benestari_fatturazione.id,
      bdo_id: s.benestari_fatturazione.bdo_id,
      n: s.benestari_fatturazione.numero_benestare,
    });
    for (const r of ins) befIds.set(`${r.bdo_id}|${r.n}`, r.id);
  }

  const fatt = new Map<string, string | null>();
  for (const r of rows) if (r.fattura) fatt.set(r.fattura, fatt.get(r.fattura) ?? r.data_fattura);
  const fattIds = new Map<string, number>();
  for (const part of chunks([...fatt.entries()])) {
    await db
      .insert(s.fatture)
      .values(part.map(([numero, data_fattura]) => ({ numero, data_fattura })))
      .onConflictDoUpdate({ target: s.fatture.numero, set: { data_fattura: sql`coalesce(excluded.data_fattura, ${s.fatture.data_fattura})` } });
    const got = await db.select({ id: s.fatture.id, n: s.fatture.numero }).from(s.fatture).where(inArray(s.fatture.numero, part.map(([n]) => n)));
    for (const g of got) fattIds.set(g.n, g.id);
  }

  const righe = rows.map((r) => ({
    bef_id: befIds.get(`${ctx.bdoIds.get(r.bdo)!}|${r.benestare}`)!,
    posizione: r.linea_ordine,
    ricezione: r.ricezione,
    linea_ricezione: r.linea_ricezione,
    periodo: r.periodo,
    fornitore_id: fid(ctx, r.fornitore),
    importo: money(r.importo),
    fattura_id: r.fattura ? fattIds.get(r.fattura) ?? null : null,
  }));
  for (const part of chunks(righe)) await db.insert(s.righe_bef).values(part);

  // Pagamento = somma delle righe della fattura incassate in una certa data.
  const pag = new Map<string, { fattura_id: number; data_pagamento: string; importo: number }>();
  for (const r of rows) {
    if (!r.fattura || !r.data_pagamento) continue;
    const fattura_id = fattIds.get(r.fattura)!;
    const k = `${fattura_id}|${r.data_pagamento}`;
    const cur = pag.get(k) ?? { fattura_id, data_pagamento: r.data_pagamento, importo: 0 };
    cur.importo += r.importo;
    pag.set(k, cur);
  }
  const pagFatt = [...new Set([...pag.values()].map((p) => p.fattura_id))];
  for (const part of chunks(pagFatt)) await db.delete(s.pagamenti).where(inArray(s.pagamenti.fattura_id, part));
  for (const part of chunks([...pag.values()])) {
    await db.insert(s.pagamenti).values(part.map((p) => ({ ...p, importo: money(p.importo) })));
  }
  await refreshStatoBdo(db);
  return { tipo: 'bef', righe_lette: rows.length, bdo: ctx.bdoIds.size, contratti: ctx.contrattoIds.size, fornitori: ctx.fornitoreIds.size };
}

export async function importVerbali(db: Db, tipo: VerbaleRow['tipo'], rows: VerbaleRow[]): Promise<ImportSummary> {
  const ctx = await prepare(db, rows, new Map());
  for (const part of chunks([...ctx.bdoIds.values()])) {
    await db.delete(s.verbali).where(sql`${s.verbali.bdo_id} in ${part} and ${s.verbali.tipo} = ${tipo}`);
  }
  const vals = rows.map((r) => ({
    bdo_id: ctx.bdoIds.get(r.bdo)!,
    tipo: r.tipo,
    codifica: r.codifica,
    periodo: r.periodo,
    stato: r.stato,
    fornitore_id: fid(ctx, r.fornitore),
    data_firma: r.data_firma,
    dettagli: r.dettagli,
  }));
  for (const part of chunks(vals)) await db.insert(s.verbali).values(part);
  return { tipo, righe_lette: rows.length, bdo: ctx.bdoIds.size, contratti: 0, fornitori: ctx.fornitoreIds.size };
}

export type IfRow = {
  numero_if: string;
  bdo: string | null;
  titolo: string | null;
  ambito: string | null;
  modalita: string | null;
  azione: string | null;
  note: string | null;
};

// Importa le IF (file IF_ARIA / Dashboard) e le associa 1:1 ai BdO. I campi
// applicativi (ambito, modalità, azione, note) si scrivono solo alla prima
// creazione: un reimport non sovrascrive ciò che gli utenti hanno modificato.
// Un'associazione che violerebbe l'unicità (BdO o IF già associati a un altro)
// non viene applicata e finisce nel report dei conflitti.
export async function importIf(db: Db, rows: IfRow[]): Promise<ImportSummary & { conflitti: string[] }> {
  const byIf = new Map(rows.map((r) => [r.numero_if, r]));
  for (const part of chunks([...byIf.values()])) {
    await db
      .insert(s.interventi_fornitura)
      .values(part.map((r) => ({ numero_if: r.numero_if, titolo: r.titolo, ambito: r.ambito, modalita: r.modalita, azione: r.azione, note: r.note })))
      .onConflictDoUpdate({
        target: s.interventi_fornitura.numero_if,
        set: { titolo: sql`coalesce(excluded.titolo, ${s.interventi_fornitura.titolo})`, updated_at: sql`now()` },
      });
  }
  const withBdo = [...byIf.values()].filter((r) => r.bdo);
  const bdoIds = await upsertBdo(db, new Map(withBdo.map((r) => [r.bdo!, { contratto_id: null, descrizione: null }])));
  const ifIds = new Map<string, number>();
  for (const part of chunks([...byIf.keys()])) {
    const got = await db.select({ id: s.interventi_fornitura.id, n: s.interventi_fornitura.numero_if }).from(s.interventi_fornitura).where(inArray(s.interventi_fornitura.numero_if, part));
    for (const g of got) ifIds.set(g.n, g.id);
  }
  const existing = await db.select().from(s.associazioni_bdo_if);
  const byBdo = new Map(existing.map((a) => [a.bdo_id, a.if_id]));
  const byIfId = new Map(existing.map((a) => [a.if_id, a.bdo_id]));
  const conflitti: string[] = [];
  const nuove: { bdo_id: number; if_id: number; origine_associazione: string }[] = [];
  for (const r of withBdo) {
    const bdo_id = bdoIds.get(r.bdo!)!;
    const if_id = ifIds.get(r.numero_if)!;
    if (byBdo.get(bdo_id) === if_id) continue;
    if (byBdo.has(bdo_id) || byIfId.has(if_id)) {
      conflitti.push(`BdO ${r.bdo} ↔ IF ${r.numero_if}: già associati ad altro`);
      continue;
    }
    byBdo.set(bdo_id, if_id);
    byIfId.set(if_id, bdo_id);
    nuove.push({ bdo_id, if_id, origine_associazione: 'Importazione' });
  }
  for (const part of chunks(nuove)) await db.insert(s.associazioni_bdo_if).values(part);
  await refreshStatoBdo(db);
  return { tipo: 'if', righe_lette: rows.length, bdo: bdoIds.size, contratti: 0, fornitori: 0, conflitti };
}

// Entry point per un file SAP: riconosce il tipo dal foglio, importa e
// registra l'esito in importazioni_sap.
export async function importSapFile(
  db: Db,
  nomeFile: string,
  buf: ArrayBuffer | Buffer | Uint8Array,
  utente: string | null,
): Promise<ImportSummary | null> {
  const parsed: ParsedSap | null = parseSapFile(buf);
  if (!parsed) return null;
  const hash = createHash('sha256').update(new Uint8Array(buf as ArrayBuffer)).digest('hex');
  try {
    const summary =
      parsed.kind === 'pdc' ? await importPdc(db, parsed.rows)
      : parsed.kind === 'bef' ? await importBef(db, parsed.rows)
      : await importVerbali(db, parsed.kind, parsed.rows);
    await db.insert(s.importazioni_sap).values({ nome_file: nomeFile, tipo: parsed.kind, hash, righe_lette: summary.righe_lette, utente });
    return summary;
  } catch (e) {
    await db.insert(s.importazioni_sap).values({ nome_file: nomeFile, tipo: parsed.kind, hash, esito: 'errore', messaggio: e instanceof Error ? e.message : String(e), utente });
    throw e;
  }
}

