// Logica di vista della scheda «Controlli»: filtri e formattazione, pura e testabile.
import type { Confronto, Esito, Stato } from '@/lib/riconciliazione';

// Righe mostrate al massimo: tiene limitato il DOM anche con migliaia di confronti.
export const MAX_RIGHE_VISIBILI = 300;

export const STATO_LABEL: Record<Stato, string> = {
  quadra: 'Quadra',
  arrotondamento: 'Arrotondamento',
  discrepanza: 'Discrepanza',
  non_confrontabile: 'Non confrontabile',
};

export const STATO_CLASS: Record<Stato, string> = {
  quadra: 'st-ok',
  arrotondamento: 'st-rnd',
  discrepanza: 'st-bad',
  non_confrontabile: 'st-na',
};

// Esiti della vista corrente: quelli degli IF filtrati.
export function esitiInVista(esiti: readonly Esito[], ifInVista: ReadonlySet<string>): Esito[] {
  return esiti.filter((e) => ifInVista.has(e.numero_if));
}

// Una riga della vista unica: un IF con i tre valori affiancati e i tre confronti fra colonne.
export type RigaIf = {
  numero_if: string;
  generalita: number | null; // Importo Previsto
  gg: number | null; // Σ gg × tariffa
  fornitura: number | null; // Σ costi Oggetto Fornitura
  confronti: Record<Confronto, Esito>;
  stato: Stato; // il peggiore fra i tre confronti
  motivi: string[]; // perché un confronto non è possibile, senza ripetizioni
};

const GRAVITA: Record<Stato, number> = { discrepanza: 0, non_confrontabile: 1, arrotondamento: 2, quadra: 3 };
export const ORDINE_CONFRONTI: readonly Confronto[] = ['gen_gg', 'gen_forn', 'gg_forn'];

// Raggruppa i confronti per IF. Un IF senza i tre confronti (input incompleto) non produce riga.
export function righePerIf(esiti: readonly Esito[]): RigaIf[] {
  const perIf = new Map<string, Partial<Record<Confronto, Esito>>>();
  for (const e of esiti) perIf.set(e.numero_if, { ...(perIf.get(e.numero_if) ?? {}), [e.confronto]: e });
  const out: RigaIf[] = [];
  for (const [numero_if, c] of perIf) {
    if (!c.gen_gg || !c.gen_forn || !c.gg_forn) continue;
    const confronti = c as Record<Confronto, Esito>;
    const lista = ORDINE_CONFRONTI.map((k) => confronti[k]);
    out.push({
      numero_if,
      generalita: confronti.gen_gg.primo,
      gg: confronti.gen_gg.secondo,
      fornitura: confronti.gen_forn.secondo,
      confronti,
      stato: lista.reduce<Stato>((w, e) => (GRAVITA[e.stato] < GRAVITA[w] ? e.stato : w), 'quadra'),
      motivi: [...new Set(lista.map((e) => e.motivo).filter((m): m is string => m != null))],
    });
  }
  return out;
}

// Senza «mostra anche ciò che quadra» restano gli IF con almeno un confronto che non quadra.
export function filtra(righe: readonly RigaIf[], soloProblemi: boolean): RigaIf[] {
  return righe.filter((r) => !soloProblemi || ORDINE_CONFRONTI.some((k) => r.confronti[k].stato !== 'quadra'));
}

// Importi con il separatore delle migliaia SEMPRE presente (l'italiano lo omette sotto le 5 cifre:
// in una colonna di confronto "2963,93" accanto a "14.424,26" è fuorviante).
const FORMATO = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' } as Intl.NumberFormatOptions);
const eur = (n: number): string => `€ ${FORMATO.format(n)}`;

export const euro = (n: number | null): string => (n == null ? '—' : eur(n));

export function differenza(n: number | null): string {
  if (n == null) return '—';
  if (n === 0) return eur(0);
  return `${n > 0 ? '+' : '−'}${eur(Math.abs(n))}`;
}

export const ammesso = (n: number | null): string => (n == null ? '—' : `± ${eur(n)}`);

// Ordine di lettura: prima le discrepanze (la più grande in cima), poi i non confrontabili, gli
// arrotondamenti e infine ciò che quadra. A parità, per IF: l'ordine è stabile.
const scarto = (r: RigaIf): number => Math.max(...ORDINE_CONFRONTI.map((k) => Math.abs(r.confronti[k].differenza ?? 0)));

export function ordina(righe: readonly RigaIf[]): RigaIf[] {
  return [...righe].sort((a, b) => {
    if (GRAVITA[a.stato] !== GRAVITA[b.stato]) return GRAVITA[a.stato] - GRAVITA[b.stato];
    if (scarto(a) !== scarto(b)) return scarto(b) - scarto(a);
    return a.numero_if.localeCompare(b.numero_if);
  });
}

// Specchietto in fondo alla scheda: formula e fonte di ogni colonna.
export const LEGENDA: readonly { colonna: string; formula: string; fonte: string }[] = [
  {
    colonna: 'Generalità',
    formula: 'Importo Previsto dell\'IF',
    fonte: 'Foglio «Generalità» del file Aggregatore (colonna Importo Previsto)',
  },
  {
    colonna: 'Σ gg × tariffa',
    formula: 'Σ (gg della riga × tariffa del profilo professionale) su tutte le righe del GdL dell\'IF',
    fonte: 'Foglio «GdL - Gruppo di Lavoro» (giornate per figura) × tariffe di gara in Gestione dati › Figure professionali e tariffe. Non calcolata per gli IF a canone, pagati a canone e non a giornate',
  },
  {
    colonna: 'Σ Oggetto Fornitura',
    formula: 'Σ costo complessivo di tutte le linee dell\'IF',
    fonte: 'Foglio «Oggetto Fornitura» del file Aggregatore (costo complessivo per linea)',
  },
  {
    colonna: 'GG × profilo − Generalità',
    formula: 'Σ gg × tariffa − Importo Previsto',
    fonte: 'Colonne Σ gg × tariffa e Generalità. Ammesso: 0,01 € + Σ (0,005 gg × tariffa riga)',
  },
  {
    colonna: 'Fornitura − Generalità',
    formula: 'Σ Oggetto Fornitura − Importo Previsto',
    fonte: 'Colonne Σ Oggetto Fornitura e Generalità. Ammesso: 0,05 €',
  },
  {
    colonna: 'Fornitura − GG × profilo',
    formula: 'Σ Oggetto Fornitura − Σ gg × tariffa',
    fonte: 'Colonne Σ Oggetto Fornitura e Σ gg × tariffa. Ammesso: 0,01 € + Σ (0,005 gg × tariffa riga)',
  },
  {
    colonna: 'Stato',
    formula: 'Quadra se |differenza| ≤ 0,05 €; Arrotondamento se ≤ ammesso; Discrepanza altrimenti; Non confrontabile se manca un valore',
    fonte: 'Lo stato dell\'IF è il peggiore fra i tre confronti. Nessuna soglia percentuale; nessuna somma parziale',
  },
];

// Etichetta dell'entità confrontata: l'IF.
export const entita = (r: Pick<RigaIf, 'numero_if'>): string => `IF ${r.numero_if}`;
