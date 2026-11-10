// Ripartizione dell'importo di un IF fra le aziende dell'RTI, secondo le righe di «Oggetto Fornitura».
// Un IF può essere eseguito da più aziende (es. Intellera + Deloitte): attribuirlo per intero al solo
// «fornitore» dell'IF sposta sull'azienda sbagliata la quota di massimale consumata. La ripartizione
// usa il costo di ogni riga della fornitura, come fa il quadro contrattuale dell'Aggregatore.
//
// Modulo puro: nessun accesso a DB, rete o orologio.
import type { FornituraRiga, Intervento } from './types';

export const MAX_RIGHE_FORNITURA = 20_000;
// Entro questa distanza dalla somma 1 le quote sono considerate normalizzate.
const EPS = 1e-9;

// numero_if -> azienda -> frazione dell'importo (le frazioni di un IF sommano 1).
export type QuotePartner = Record<string, Record<string, number>>;

// Frazioni di costo per azienda di ogni IF le cui righe sono TUTTE attribuibili: costo presente,
// non negativo, azienda nota, somma positiva. Gli altri IF non compaiono: per loro vale il
// fornitore dell'IF. Una ripartizione parziale darebbe una quota falsa.
export function quotePerIf(fornitura: readonly FornituraRiga[]): QuotePartner {
  if (fornitura.length > MAX_RIGHE_FORNITURA) {
    throw new Error(`Oggetto Fornitura: ${fornitura.length} righe, massimo ${MAX_RIGHE_FORNITURA}`);
  }
  const costi = new Map<string, Map<string, number> | null>();
  for (const r of fornitura) accumulaRiga(costi, r);
  const out: QuotePartner = {};
  for (const [numeroIf, perAzienda] of costi) {
    const frazioni = perAzienda ? normalizza(perAzienda) : null;
    if (frazioni) out[numeroIf] = frazioni;
  }
  return out;
}

// Aggiunge il costo di una riga; un IF con una riga non attribuibile resta a null (escluso).
function accumulaRiga(costi: Map<string, Map<string, number> | null>, r: FornituraRiga): void {
  if (costi.get(r.numero_if) === null) return;
  const attribuibile = r.fornitore != null && r.costo_complessivo != null && Number.isFinite(r.costo_complessivo) && r.costo_complessivo >= 0;
  if (!attribuibile) {
    costi.set(r.numero_if, null);
    return;
  }
  const perAzienda = costi.get(r.numero_if) ?? new Map<string, number>();
  perAzienda.set(r.fornitore as string, (perAzienda.get(r.fornitore as string) ?? 0) + (r.costo_complessivo as number));
  costi.set(r.numero_if, perAzienda);
}

function normalizza(perAzienda: ReadonlyMap<string, number>): Record<string, number> | null {
  let tot = 0;
  for (const v of perAzienda.values()) tot += v;
  if (!(tot > 0)) return null;
  const out: Record<string, number> = {};
  for (const [azienda, v] of perAzienda) out[azienda] = v / tot;
  return out;
}

// Importo di un IF per azienda: ripartito secondo `quote` se l'IF ha una ripartizione valida,
// altrimenti per intero al suo fornitore. La somma delle parti è sempre l'importo dell'IF.
export function ripartisci(i: Pick<Intervento, 'numero_if' | 'fornitore' | 'importo'>, quote?: QuotePartner): [string, number][] {
  const frazioni = quote?.[i.numero_if];
  if (!frazioni) return [[i.fornitore, i.importo]];
  const parti = Object.entries(frazioni).map(([azienda, f]): [string, number] => [azienda, i.importo * f]);
  const somma = Object.values(frazioni).reduce((s, f) => s + f, 0);
  return Math.abs(somma - 1) <= EPS ? parti : [[i.fornitore, i.importo]];
}
