// Logica di vista della scheda «Controlli»: filtri e formattazione, pura e testabile.
import { esitoRti, type Esito, type Livello, type Stato } from '@/lib/riconciliazione';

// Righe mostrate al massimo: tiene limitato il DOM anche con migliaia di confronti.
export const MAX_RIGHE_VISIBILI = 300;

export const LIVELLI: readonly { id: Livello | 'tutti'; label: string }[] = [
  { id: 'tutti', label: 'Tutti i livelli' },
  { id: 'milestone', label: 'Milestone' },
  { id: 'azienda', label: 'Azienda' },
  { id: 'if', label: 'IF' },
  { id: 'rti', label: 'RTI' },
  { id: 'dati', label: 'Dati' },
];

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

// Esiti della vista corrente: quelli degli IF filtrati, quelli senza IF (note sui dati) e il
// confronto RTI ricalcolato sui soli IF in vista.
export function esitiInVista(esiti: readonly Esito[], ifInVista: ReadonlySet<string>): Esito[] {
  const visibili = esiti.filter((e) => e.livello !== 'rti' && (e.numero_if == null || ifInVista.has(e.numero_if)));
  const ifEsiti = visibili.filter((e) => e.livello === 'if');
  return [...visibili.filter((e) => e.livello === 'if' || e.livello === 'milestone' || e.livello === 'azienda'), esitoRti(ifEsiti), ...visibili.filter((e) => e.livello === 'dati')];
}

export function filtra(esiti: readonly Esito[], livello: Livello | 'tutti', soloProblemi: boolean): Esito[] {
  return esiti.filter((e) => (livello === 'tutti' || e.livello === livello) && (!soloProblemi || e.stato !== 'quadra'));
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
// arrotondamenti e infine ciò che quadra. A parità, per IF e chiave: l'ordine è stabile.
const GRAVITA: Record<Stato, number> = { discrepanza: 0, non_confrontabile: 1, arrotondamento: 2, quadra: 3 };

export function ordina(esiti: readonly Esito[]): Esito[] {
  return [...esiti].sort((a, b) => {
    if (GRAVITA[a.stato] !== GRAVITA[b.stato]) return GRAVITA[a.stato] - GRAVITA[b.stato];
    const da = Math.abs(a.differenza ?? 0);
    const db = Math.abs(b.differenza ?? 0);
    if (da !== db) return db - da;
    return `${a.numero_if ?? ''}${a.chiave}`.localeCompare(`${b.numero_if ?? ''}${b.chiave}`);
  });
}

// Etichetta dell'entità confrontata: l'IF e, se c'è, la milestone/azienda/figura.
export function entita(e: Esito): string {
  if (e.numero_if && e.chiave) return `IF ${e.numero_if} · ${e.chiave}`;
  if (e.numero_if) return `IF ${e.numero_if}`;
  return e.chiave || 'Contratto';
}
