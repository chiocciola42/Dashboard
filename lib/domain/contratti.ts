import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

type Runner = { execute(query: SQL): PromiseLike<unknown> };

export type Totali = {
  valore: number;
  avanzato: number;
  bef: number;
  fatturato: number;
  incassato: number;
  residuo: number;
};

export type ContrattoRiepilogo = Totali & {
  id: number;
  codice: string;
  n_bdo: number;
  n_da_riconciliare: number;
};

export type FornitoreRiepilogo = Totali & { id: number | null; nome: string };

const rowsOf = <T>(res: unknown): T[] =>
  (Array.isArray(res) ? res : (res as { rows?: T[] }).rows ?? []) as T[];
const n = (v: unknown) => (v == null ? 0 : Number(v));

function totali(r: Record<string, unknown>): Totali {
  const valore = n(r.valore);
  const avanzato = n(r.avanzato);
  return {
    valore,
    avanzato,
    bef: n(r.bef),
    fatturato: n(r.fatturato),
    incassato: n(r.incassato),
    residuo: valore - avanzato,
  };
}

// Valore = Σ posizioni; avanzato = Σ PDC; BEF = Σ righe BEF; fatturato = Σ righe
// con fattura; incassato = Σ righe la cui fattura ha un pagamento. Ogni misura
// è aggregata per BdO prima del join, per non moltiplicare le righe.
const PER_BDO = sql`
  with v as (select bdo_id, sum(importo) s from posizioni_bdo group by 1),
       a as (select bdo_id, sum(importo) s from piani_consegna group by 1),
       b as (
         select f.bdo_id,
                sum(r.importo) bef,
                sum(case when r.fattura_id is not null then r.importo end) fat,
                sum(case when exists (select 1 from pagamenti p where p.fattura_id = r.fattura_id) then r.importo end) inc
         from righe_bef r join benestari_fatturazione f on f.id = r.bef_id group by 1)`;

export async function listContratti(db: Runner): Promise<ContrattoRiepilogo[]> {
  const res = await db.execute(sql`${PER_BDO}
    select c.id, c.codice,
           count(bo.id) n_bdo,
           count(*) filter (where bo.stato = 'da_riconciliare') n_da_riconciliare,
           coalesce(sum(v.s), 0) valore, coalesce(sum(a.s), 0) avanzato,
           coalesce(sum(b.bef), 0) bef, coalesce(sum(b.fat), 0) fatturato, coalesce(sum(b.inc), 0) incassato
    from contratti c
    left join buoni_ordine bo on bo.contratto_id = c.id
    left join v on v.bdo_id = bo.id
    left join a on a.bdo_id = bo.id
    left join b on b.bdo_id = bo.id
    group by c.id, c.codice
    order by c.codice`);
  return rowsOf<Record<string, unknown>>(res).map((r) => ({
    id: n(r.id),
    codice: String(r.codice),
    n_bdo: n(r.n_bdo),
    n_da_riconciliare: n(r.n_da_riconciliare),
    ...totali(r),
  }));
}

// Ripartizione per fornitore di un contratto: l'attribuzione è sulle singole
// posizioni e movimentazioni, non sul BdO (un BdO può avere più fornitori).
export async function getContratto(
  db: Runner,
  id: number,
): Promise<{ contratto: ContrattoRiepilogo; fornitori: FornitoreRiepilogo[] } | null> {
  const all = await listContratti(db);
  const contratto = all.find((c) => c.id === id);
  if (!contratto) return null;
  const res = await db.execute(sql`
    with bdo as (select id from buoni_ordine where contratto_id = ${id}),
    v as (select p.fornitore_id f, sum(p.importo) s from posizioni_bdo p join bdo on bdo.id = p.bdo_id group by 1),
    a as (select p.fornitore_id f, sum(p.importo) s from piani_consegna p join bdo on bdo.id = p.bdo_id group by 1),
    b as (
      select r.fornitore_id f, sum(r.importo) bef,
             sum(case when r.fattura_id is not null then r.importo end) fat,
             sum(case when exists (select 1 from pagamenti pg where pg.fattura_id = r.fattura_id) then r.importo end) inc
      from righe_bef r join benestari_fatturazione bf on bf.id = r.bef_id join bdo on bdo.id = bf.bdo_id group by 1),
    ids as (select f from v union select f from a union select f from b)
    select fo.id, coalesce(fo.nome, 'Non attribuito') nome,
           coalesce(v.s, 0) valore, coalesce(a.s, 0) avanzato,
           coalesce(b.bef, 0) bef, coalesce(b.fat, 0) fatturato, coalesce(b.inc, 0) incassato
    from ids
    left join fornitori fo on fo.id = ids.f
    left join v on v.f is not distinct from ids.f
    left join a on a.f is not distinct from ids.f
    left join b on b.f is not distinct from ids.f
    order by valore desc`);
  const fornitori = rowsOf<Record<string, unknown>>(res).map((r) => ({
    id: r.id == null ? null : n(r.id),
    nome: String(r.nome),
    ...totali(r),
  }));
  return { contratto, fornitori };
}
