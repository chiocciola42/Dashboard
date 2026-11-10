// Riconciliazione fra valori RICOSTRUITI (giornate × tariffa di gara) e valori IMPORTATI (importo
// dell'IF, costi di "Oggetto Fornitura"). Importi e giornate derivano dalla stessa fonte, quindi
// devono coincidere salvo arrotondamenti: una differenza oltre la soglia è un errore nelle fonti
// (o nel calcolo, che i test verificano su casi esatti). Nessuna soglia percentuale.
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

export type Livello = 'milestone' | 'azienda' | 'if' | 'rti' | 'dati';
export type Stato = 'quadra' | 'arrotondamento' | 'discrepanza' | 'non_confrontabile';

export type Esito = {
  livello: Livello;
  numero_if: string | null; // null per il livello RTI
  chiave: string; // codice milestone, azienda, figura… ("" se non serve)
  controllo: string;
  importato: number | null;
  ricostruito: number | null;
  differenza: number | null; // ricostruito − importato, in centesimi
  ammesso: number | null; // soglia di arrotondamento dell'entità
  stato: Stato;
  motivo: string | null; // perché non confrontabile, o nota
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

type Meta = Pick<Esito, 'livello' | 'numero_if' | 'chiave' | 'controllo'>;

const nonConfrontabile = (m: Meta, importato: number | null, motivo: string): Esito => ({
  ...m,
  importato,
  ricostruito: null,
  differenza: null,
  ammesso: null,
  stato: 'non_confrontabile',
  motivo,
});

// Confronto fra un valore importato (se presente) e la ricostruzione di un gruppo di righe.
export function confronta(m: Meta, importato: number | null, ric: Ricostruzione, motivoMancante: string): Esito {
  if (importato == null) return nonConfrontabile(m, null, motivoMancante);
  if (!ric.ok) return nonConfrontabile(m, arrotonda(importato), ric.motivo);
  const differenza = arrotonda(ric.ricostruito - importato);
  return {
    ...m,
    importato: arrotonda(importato),
    ricostruito: ric.ricostruito,
    differenza,
    ammesso: ric.ammesso,
    stato: classifica(differenza, ric.ammesso),
    motivo: null,
  };
}

// ---------------------------------------------------------------------------------------------
// Raggruppamenti
// ---------------------------------------------------------------------------------------------
function raggruppa<T>(righe: readonly T[], chiave: (r: T) => string | null): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of righe) {
    const k = chiave(r);
    if (k == null) continue;
    m.set(k, [...(m.get(k) ?? []), r]);
  }
  return m;
}

// Somma dei costi di un gruppo di linee; null se non ci sono linee o se UNA ha il costo mancante
// (una somma parziale darebbe un importato falso).
function sommaCosti(linee: readonly FornituraRiga[] | undefined): number | null {
  if (!linee || linee.length === 0) return null;
  let tot = 0;
  for (const l of linee) {
    if (l.costo_complessivo == null) return null;
    tot += l.costo_complessivo;
  }
  return tot;
}

const SEP = '\u0000';
const kMs = (numeroIf: string, codice: string): string => `${numeroIf}${SEP}${codice}`;

// ---------------------------------------------------------------------------------------------
// Livelli
// ---------------------------------------------------------------------------------------------
function esitiIf(inp: RiconciliazioneInput, tariffe: Tariffe): Esito[] {
  const perIf = raggruppa(inp.gdl, (r) => r.numero_if);
  return inp.interventi.map((i) =>
    confronta(
      { livello: 'if', numero_if: i.numero_if, chiave: '', controllo: 'Σ gg × tariffa contro importo IF' },
      i.importo,
      ricostruisci(perIf.get(i.numero_if) ?? [], tariffe),
      'importo IF assente',
    ),
  );
}

function esitiMilestone(inp: RiconciliazioneInput, tariffe: Tariffe): Esito[] {
  const righe = raggruppa(inp.gdl, (r) => (r.codice ? kMs(r.numero_if, r.codice) : null));
  const costi = raggruppa(inp.fornitura, (l) => (l.codice ? kMs(l.numero_if, l.codice) : null));
  const out: Esito[] = [];
  for (const [k, gruppo] of righe) {
    const [numeroIf, codice] = k.split(SEP);
    out.push(
      confronta(
        { livello: 'milestone', numero_if: numeroIf, chiave: codice, controllo: 'Σ gg × tariffa contro costo milestone' },
        sommaCosti(costi.get(k)),
        ricostruisci(gruppo, tariffe),
        'costo della milestone assente in «Oggetto Fornitura»',
      ),
    );
  }
  return out;
}

function esitiAzienda(inp: RiconciliazioneInput, tariffe: Tariffe): Esito[] {
  const righe = raggruppa(inp.gdl, (r) => (r.azienda ? kMs(r.numero_if, r.azienda) : null));
  const costi = raggruppa(inp.fornitura, (l) => (l.fornitore ? kMs(l.numero_if, l.fornitore) : null));
  const out: Esito[] = [];
  for (const [k, gruppo] of righe) {
    const [numeroIf, azienda] = k.split(SEP);
    out.push(
      confronta(
        { livello: 'azienda', numero_if: numeroIf, chiave: azienda, controllo: 'Σ gg × tariffa contro costo azienda' },
        sommaCosti(costi.get(k)),
        ricostruisci(gruppo, tariffe),
        "nessun costo per l'azienda in «Oggetto Fornitura»",
      ),
    );
  }
  return out;
}

const confrontabile = (e: Esito): boolean => e.stato !== 'non_confrontabile';

// Somma degli IF ricostruibili: importato, ricostruito e soglie si sommano.
export function esitoRti(esitiDegliIf: readonly Esito[]): Esito {
  const meta: Meta = { livello: 'rti', numero_if: null, chiave: '', controllo: 'Σ IF ricostruiti contro Σ importi' };
  const ok = esitiDegliIf.filter(confrontabile);
  if (ok.length === 0) return nonConfrontabile(meta, null, 'nessun IF confrontabile');
  const somma = (f: (e: Esito) => number | null): number => ok.reduce((s, e) => s + (f(e) ?? 0), 0);
  const importato = arrotonda(somma((e) => e.importato));
  const ricostruito = arrotonda(somma((e) => e.ricostruito));
  const ammesso = arrotonda(somma((e) => e.ammesso));
  const differenza = arrotonda(ricostruito - importato);
  return {
    ...meta,
    importato,
    ricostruito,
    differenza,
    ammesso,
    stato: classifica(differenza, ammesso),
    motivo: `${ok.length} IF confrontabili su ${esitiDegliIf.length}`,
  };
}

// Controlli sui dati importati, senza tariffe: l'importo dell'IF deve essere la somma dei costi delle
// sue linee di fornitura, e le linee senza codice non entrano nel confronto per milestone.
function esitiDati(inp: RiconciliazioneInput): Esito[] {
  const perIf = raggruppa(inp.fornitura, (l) => l.numero_if);
  const out: Esito[] = inp.interventi.map((i) => {
    const meta: Meta = { livello: 'dati', numero_if: i.numero_if, chiave: '', controllo: 'Importo IF contro Σ costi «Oggetto Fornitura»' };
    const somma = sommaCosti(perIf.get(i.numero_if));
    if (somma == null) return nonConfrontabile(meta, arrotonda(i.importo), 'costi di fornitura assenti o incompleti');
    const differenza = arrotonda(somma - i.importo);
    return {
      ...meta,
      importato: arrotonda(i.importo),
      ricostruito: arrotonda(somma),
      differenza,
      ammesso: SOGLIA_QUADRA,
      stato: classifica(differenza, SOGLIA_QUADRA),
      motivo: null,
    };
  });
  const senzaCodice = inp.fornitura.filter((l) => !l.codice);
  if (senzaCodice.length > 0) {
    const costo = sommaCosti(senzaCodice);
    out.push(
      nonConfrontabile(
        { livello: 'dati', numero_if: null, chiave: '', controllo: 'Linee di fornitura senza codice milestone' },
        costo == null ? null : arrotonda(costo),
        `${senzaCodice.length} ${senzaCodice.length === 1 ? 'linea' : 'linee'}: non attribuibili a una milestone`,
      ),
    );
  }
  const gdlIf = new Set(inp.gdl.map((r) => r.numero_if));
  const noti = new Set(inp.interventi.map((i) => i.numero_if));
  for (const id of [...gdlIf].filter((x) => !noti.has(x)).sort()) {
    out.push(nonConfrontabile({ livello: 'dati', numero_if: null, chiave: id, controllo: 'IF del GdL assente in «Generalità»' }, null, 'IF non presente in portafoglio'));
  }
  return out;
}

// Figure con giornate nel GdL ma senza tariffa: servono per spiegare perché molti confronti non sono
// possibili.
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
  const perIf = esitiIf(inp, tariffe);
  return {
    esiti: [...perIf, ...esitiMilestone(inp, tariffe), ...esitiAzienda(inp, tariffe), esitoRti(perIf), ...esitiDati(inp)],
    tariffeMancanti: figureSenzaTariffa(inp.gdl, tariffe),
    righe: { gdl: inp.gdl.length, fornitura: inp.fornitura.length },
  };
}

// Conteggio degli esiti per stato, opzionalmente di un solo livello.
export type ConteggioStati = Record<Stato, number>;
export function conta(esiti: readonly Esito[], livello?: Livello): ConteggioStati {
  const c: ConteggioStati = { quadra: 0, arrotondamento: 0, discrepanza: 0, non_confrontabile: 0 };
  for (const e of esiti) {
    if (livello && e.livello !== livello) continue;
    c[e.stato] += 1;
  }
  return c;
}
