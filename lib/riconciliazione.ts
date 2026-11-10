// Riconciliazione per IF fra tre valori di costo:
//   Generalità  = Importo Previsto dell'intervento (foglio «Generalità»);
//   Fornitura   = Σ costi di «Oggetto Fornitura»;
//   GG × profilo = Σ giornate × tariffa di gara del profilo professionale (foglio GdL).
// Tre confronti, nient'altro: Generalità↔GG×profilo, Fornitura↔Generalità, Fornitura↔GG×profilo.
// Le fonti descrivono la stessa fornitura, quindi devono coincidere salvo arrotondamenti: una
// differenza oltre la soglia è un errore nelle fonti. Nessuna soglia percentuale.
//
// Modulo puro: nessun accesso a DB, rete o orologio. Le tariffe arrivano dall'esterno (app_config)
// e qui non si modificano mai.
import { figuraKey } from './seniority';
import type { FornituraRiga, GdlRiga, Seniority } from './types';

export const MAX_IF = 5_000;
export const MAX_RIGHE = 20_000;
// Entro questa differenza (in €) due valori "quadrano".
export const SOGLIA_QUADRA = 0.05;
// Errore massimo di arrotondamento di una riga: le giornate nel foglio hanno al massimo 2 decimali,
// quindi ciascuna è nota a ±0,005 GG. Moltiplicato per la tariffa dà l'errore massimo in €.
export const GG_ERRORE_MAX = 0.005;
const CENTESIMO = 0.01;

export type Confronto = 'gen_gg' | 'forn_gen' | 'forn_gg';
export type Stato = 'quadra' | 'arrotondamento' | 'discrepanza' | 'non_confrontabile';

// Etichette dei due termini di ogni confronto, nell'ordine in cui il controllo li nomina.
export const CONFRONTI: Record<Confronto, { label: string; primo: string; secondo: string }> = {
  gen_gg: { label: 'Generalità ↔ GG × profilo', primo: 'Generalità (Importo Previsto)', secondo: 'GG × profilo' },
  forn_gen: { label: 'Fornitura ↔ Generalità', primo: 'Σ Oggetto Fornitura', secondo: 'Generalità (Importo Previsto)' },
  forn_gg: { label: 'Fornitura ↔ GG × profilo', primo: 'Σ Oggetto Fornitura', secondo: 'GG × profilo' },
};

export type Esito = {
  confronto: Confronto;
  numero_if: string;
  controllo: string;
  primo: number | null;
  secondo: number | null;
  differenza: number | null; // secondo − primo, in centesimi
  ammesso: number | null; // soglia di arrotondamento
  stato: Stato;
  motivo: string | null; // perché non confrontabile
};

export type IfValore = { numero_if: string; importo: number };

export type RiconciliazioneInput = {
  interventi: readonly IfValore[];
  gdl: readonly GdlRiga[];
  fornitura: readonly FornituraRiga[];
  seniority: readonly Seniority[];
};

export type Riconciliazione = {
  esiti: Esito[];
  tariffeMancanti: string[]; // figure con giornate nel GdL ma senza tariffa
  // Righe importate: 0 = il file Aggregatore non è ancora stato caricato (nulla da confrontare).
  righe: { gdl: number; fornitura: number };
};

// Report consegnato alla scheda «Controlli». `errore` valorizzato = i dati importati sono
// inconsistenti e il calcolo non è stato eseguito: la scheda lo mostra, non lo nasconde.
export type Controlli = Riconciliazione & { errore: string | null };

export class RiconciliazioneInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RiconciliazioneInputError';
  }
}

// ---------------------------------------------------------------------------------------------
// Validazione ai confini
// ---------------------------------------------------------------------------------------------
function assertInput(inp: RiconciliazioneInput): void {
  if (inp.interventi.length > MAX_IF) throw new RiconciliazioneInputError(`${inp.interventi.length} IF, massimo ${MAX_IF}`);
  if (inp.gdl.length > MAX_RIGHE) throw new RiconciliazioneInputError(`${inp.gdl.length} righe GdL, massimo ${MAX_RIGHE}`);
  if (inp.fornitura.length > MAX_RIGHE) throw new RiconciliazioneInputError(`${inp.fornitura.length} righe di fornitura, massimo ${MAX_RIGHE}`);
  for (const i of inp.interventi) {
    if (!Number.isFinite(i.importo)) throw new RiconciliazioneInputError(`importo non valido per l'IF ${i.numero_if}`);
  }
  for (const r of inp.gdl) {
    if (r.gg != null && !(Number.isFinite(r.gg) && r.gg >= 0)) throw new RiconciliazioneInputError(`GG non validi per l'IF ${r.numero_if}`);
  }
  for (const r of inp.fornitura) {
    if (r.costo_complessivo != null && !Number.isFinite(r.costo_complessivo)) {
      throw new RiconciliazioneInputError(`costo non valido per l'IF ${r.numero_if}`);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Aritmetica
// ---------------------------------------------------------------------------------------------
export const arrotonda = (n: number): number => Math.round(n * 100) / 100;

// Esito di un confronto: "quadra" entro 0,05 €, "arrotondamento" entro la soglia della riga,
// altrimenti "discrepanza".
export function classifica(differenza: number, ammesso: number): Stato {
  const d = Math.abs(arrotonda(differenza));
  if (d <= SOGLIA_QUADRA) return 'quadra';
  return d <= arrotonda(ammesso) ? 'arrotondamento' : 'discrepanza';
}

// ---------------------------------------------------------------------------------------------
// Tariffe e ricostruzione
// ---------------------------------------------------------------------------------------------
export type Tariffe = ReadonlyMap<string, number>;

// Tariffa €/GG per figura: solo valori numerici positivi. Una tariffa assente o 0 non è una tariffa.
export function tariffeDa(seniority: readonly Seniority[]): Tariffe {
  const m = new Map<string, number>();
  for (const s of seniority) {
    if (s.tariffa != null && Number.isFinite(s.tariffa) && s.tariffa > 0) m.set(figuraKey(s.figura), s.tariffa);
  }
  return m;
}

export type Ricostruzione = { ok: true; ricostruito: number; ammesso: number } | { ok: false; motivo: string };

// Σ giornate × tariffa di un gruppo di righe, con la soglia di arrotondamento del gruppo
// (0,01 € + Σ 0,005 × tariffa). Un gruppo è ricostruibile solo se OGNI riga ha giornate e tariffa:
// altrimenti il risultato sarebbe parziale e il confronto falso.
export function ricostruisci(righe: readonly GdlRiga[], tariffe: Tariffe): Ricostruzione {
  if (righe.length === 0) return { ok: false, motivo: 'nessuna riga GdL' };
  const senzaGg = righe.filter((r) => r.gg == null).length;
  if (senzaGg > 0) return { ok: false, motivo: `giornate mancanti (${senzaGg} ${senzaGg === 1 ? 'riga' : 'righe'})` };
  const senzaTariffa = new Set<string>();
  let ricostruito = 0;
  let ammesso = CENTESIMO;
  for (const r of righe) {
    const t = r.figura ? tariffe.get(figuraKey(r.figura)) : undefined;
    if (t == null) {
      senzaTariffa.add(r.figura ?? '(senza figura)');
      continue;
    }
    ricostruito += (r.gg as number) * t;
    ammesso += GG_ERRORE_MAX * t;
  }
  if (senzaTariffa.size > 0) return { ok: false, motivo: `tariffa mancante: ${[...senzaTariffa].sort().join(', ')}` };
  return { ok: true, ricostruito: arrotonda(ricostruito), ammesso: arrotonda(ammesso) };
}

type Meta = Pick<Esito, 'confronto' | 'numero_if' | 'controllo'>;

const meta = (confronto: Confronto, numero_if: string): Meta => ({
  confronto,
  numero_if,
  controllo: `${CONFRONTI[confronto].primo} contro ${CONFRONTI[confronto].secondo}`,
});

const nonConfrontabile = (m: Meta, primo: number | null, secondo: number | null, motivo: string): Esito => ({
  ...m,
  primo,
  secondo,
  differenza: null,
  ammesso: null,
  stato: 'non_confrontabile',
  motivo,
});

// Confronto fra due valori; il motivo dipende da quale dei due manca.
function confronta(m: Meta, primo: number | null, secondo: number | null, ammesso: number, motivoPrimo: string, motivoSecondo: string): Esito {
  const p = primo == null ? null : arrotonda(primo);
  const sec = secondo == null ? null : arrotonda(secondo);
  if (p == null) return nonConfrontabile(m, p, sec, motivoPrimo);
  if (sec == null) return nonConfrontabile(m, p, sec, motivoSecondo);
  const differenza = arrotonda(sec - p);
  return { ...m, primo: p, secondo: sec, differenza, ammesso, stato: classifica(differenza, ammesso), motivo: null };
}

function raggruppa<T>(righe: readonly T[], chiave: (r: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of righe) {
    const k = chiave(r);
    const g = m.get(k);
    if (g) g.push(r);
    else m.set(k, [r]);
  }
  return m;
}

// Somma dei costi di un gruppo di linee; null se non ci sono linee o se UNA ha il costo mancante
// (una somma parziale darebbe un valore falso).
function sommaCosti(linee: readonly FornituraRiga[] | undefined): number | null {
  if (!linee || linee.length === 0) return null;
  let tot = 0;
  for (const l of linee) {
    if (l.costo_complessivo == null) return null;
    tot += l.costo_complessivo;
  }
  return tot;
}

// I tre confronti di un IF. Con la ricostruzione GG × profilo non eseguibile (giornate o tariffe
// mancanti) i due confronti che la usano sono "non confrontabili" con il motivo.
function esitiIf(numeroIf: string, previsto: number, costi: number | null, ric: Ricostruzione): Esito[] {
  const gg = ric.ok ? ric.ricostruito : null;
  const ammessoGg = ric.ok ? ric.ammesso : 0;
  const motivoGg = ric.ok ? '' : ric.motivo;
  const motivoForn = 'costi di fornitura assenti o incompleti';
  return [
    confronta(meta('gen_gg', numeroIf), previsto, gg, ammessoGg, 'importo previsto assente', motivoGg),
    confronta(meta('forn_gen', numeroIf), costi, previsto, SOGLIA_QUADRA, motivoForn, 'importo previsto assente'),
    confronta(meta('forn_gg', numeroIf), costi, gg, ammessoGg, motivoForn, motivoGg),
  ];
}

// Figure con giornate nel GdL ma senza tariffa: spiegano perché molti confronti non sono possibili.
function figureSenzaTariffa(gdl: readonly GdlRiga[], tariffe: Tariffe): string[] {
  const out = new Set<string>();
  for (const r of gdl) {
    if (r.gg == null || !r.figura) continue;
    if (!tariffe.has(figuraKey(r.figura))) out.add(r.figura);
  }
  return [...out].sort();
}

// Come `riconcilia`, ma un input inconsistente diventa un errore da mostrare invece di bloccare
// l'intero dashboard. Qualsiasi altro errore (bug, database) si propaga.
export function controlliDa(inp: RiconciliazioneInput): Controlli {
  try {
    return { ...riconcilia(inp), errore: null };
  } catch (e) {
    if (e instanceof RiconciliazioneInputError) {
      return { esiti: [], tariffeMancanti: [], righe: { gdl: inp.gdl.length, fornitura: inp.fornitura.length }, errore: e.message };
    }
    throw e;
  }
}

export function riconcilia(inp: RiconciliazioneInput): Riconciliazione {
  assertInput(inp);
  const tariffe = tariffeDa(inp.seniority);
  const gdl = raggruppa(inp.gdl, (r) => r.numero_if);
  const forn = raggruppa(inp.fornitura, (l) => l.numero_if);
  const esiti = inp.interventi.flatMap((i) =>
    esitiIf(i.numero_if, i.importo, sommaCosti(forn.get(i.numero_if)), ricostruisci(gdl.get(i.numero_if) ?? [], tariffe)),
  );
  return { esiti, tariffeMancanti: figureSenzaTariffa(inp.gdl, tariffe), righe: { gdl: inp.gdl.length, fornitura: inp.fornitura.length } };
}

// Conteggio degli esiti per stato, opzionalmente di un solo confronto.
export type ConteggioStati = Record<Stato, number>;
export function conta(esiti: readonly Esito[], confronto?: Confronto): ConteggioStati {
  const c: ConteggioStati = { quadra: 0, arrotondamento: 0, discrepanza: 0, non_confrontabile: 0 };
  for (const e of esiti) {
    if (confronto && e.confronto !== confronto) continue;
    c[e.stato] += 1;
  }
  return c;
}
