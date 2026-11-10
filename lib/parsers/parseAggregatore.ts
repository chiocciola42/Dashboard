import type { FornituraRiga, GdlRiga, Intervento, Seniority } from '../types';
import { ggFromCell, modalitaFromGdl, parseGdl } from './parseGdl';
import { parseFornitura } from './parseFornitura';
import { figuraKey } from '../seniority';
import { readWorkbook, sheetRows, findSheet, looseGetter, toNumber, toISODate, str, strId, normalizeFornitore, type Workbook } from './util';

export type AggregatoreResult = {
  seniority: Seniority[];
  gdl: GdlRiga[];
  fornitura: FornituraRiga[];
  interventi: Intervento[];
};

// Short codes for the most common professional figures.
// keys are normalized (lower-case, hyphens -> spaces)
const FIGURE_CODE: Record<string, string> = {
  'health care consultant junior': 'HCJ',
  'health care consultant senior': 'HCS',
  'health care consultant manager': 'HCM',
  'business consultant junior': 'BCJ',
  'business consultant senior': 'BCS',
  'business consultant manager': 'BCM',
  'strategy consultant': 'SC',
  'program manager': 'PROM',
  'project manager': 'PRJM',
  'team leader': 'TL',
};

export function codeFor(figura: string): string {
  return FIGURE_CODE[figuraKey(figura)] || figura;
}

// Limite d'ingresso dei fogli di classificazione: oltre questa dimensione il foglio è anomalo.
export const MAX_CLASSIFICAZIONI = 5_000;

// Segnaposto che l'Aggregatore scrive al posto di un codice assente ("-", "–", "—"): non è un BDO.
const SEGNAPOSTO = /^[-–—\s]+$/;

// Codice BDO di una cella, oppure null se vuota o segnaposto. Un "-" contato come BDO farebbe
// risultare «BO emesso» un IF che non ha alcun buono d'ordine.
export function bdoFromCell(v: unknown): string | null {
  const id = strId(v);
  return id == null || SEGNAPOSTO.test(id) ? null : id;
}

export type Classificazione = { ambito: string | null; attivazione: 'SI' | 'NO' | null };

const siNo = (v: unknown): 'SI' | 'NO' | null => {
  const s = str(v);
  if (!s) return null;
  if (/^s[iì]$/i.test(s)) return 'SI';
  return /^no$/i.test(s) ? 'NO' : null;
};

// Ambito e attivazione immediata per Numero IF dai fogli compilati a mano 'Anagrafica IF' e 'Ambiti'.
// 'Anagrafica IF' prevale; 'Ambiti' completa solo i campi che lì mancano. Il foglio 'Ambiti' contiene
// anche una tabella riepilogativa sotto l'elenco: le sue righe non hanno un Numero IF di un
// intervento e vengono ignorate perché si cerca solo per i Numero IF delle Generalità.
export function readClassificazioni(wb: Workbook): Map<string, Classificazione> {
  const out = new Map<string, Classificazione>();
  const sheets = [findSheet(wb, 'Anagrafica IF', 'Anagrafica'), findSheet(wb, 'Ambiti')];
  for (const name of sheets) {
    if (!name) continue;
    const rows = sheetRows(wb, name, 0);
    if (rows.length > MAX_CLASSIFICAZIONI) throw new Error(`${name}: ${rows.length} righe, massimo ${MAX_CLASSIFICAZIONI}`);
    for (const r of rows) mergeClassificazione(out, r);
  }
  return out;
}

function mergeClassificazione(out: Map<string, Classificazione>, r: Record<string, unknown>): void {
  const g = looseGetter(r);
  const numero_if = strId(g('Numero IF'));
  if (!numero_if) return;
  const cur = out.get(numero_if) ?? { ambito: null, attivazione: null };
  out.set(numero_if, {
    ambito: cur.ambito ?? str(g('Ambito')),
    attivazione: cur.attivazione ?? siNo(g('Attivazione immediata')),
  });
}

// Giornate per figura professionale dal foglio GdL, figure scritte in modo diverso
// ("Health-Care …" / "Health Care …") unite. Le righe senza GG sono voci di servizio a canone
// ("Supporto in ambito…") e non entrano nella tabella figure.
function readSeniority(wb: Workbook): Seniority[] {
  const gdlSheet = findSheet(wb, 'GdL - Gruppo di Lavoro', 'GdL');
  if (!gdlSheet) return [];
  const agg = new Map<string, { figura: string; gg: number }>();
  for (const r of sheetRows(wb, gdlSheet, 0)) {
    const figura = str(r['Figure Professionali']);
    if (!figura || ggFromCell(r['GG / Uomo']) == null) continue;
    const e = agg.get(figuraKey(figura)) ?? { figura, gg: 0 };
    e.gg += toNumber(r['GG / Uomo']);
    agg.set(figuraKey(figura), e);
  }
  return [...agg.values()].sort((a, b) => b.gg - a.gg).map((e) => ({ figura: e.figura, code: codeFor(e.figura), gg: e.gg, tariffa: null }));
}

type OfEntry = { modalita: Set<string>; sub: boolean; subNames: Set<string>; costoSub: number; fornitore: string | null };

const newOfEntry = (): OfEntry => ({ modalita: new Set<string>(), sub: false, subNames: new Set<string>(), costoSub: 0, fornitore: null });

function addOfRow(e: OfEntry, r: Record<string, unknown>): void {
  const mod = str(r['Modalità Fornitura']);
  if (mod) e.modalita.add(mod.replace('_', ' '));
  if (/^s[iì]$/i.test(String(r['Subappalto SI/NO'] ?? ''))) {
    e.sub = true;
    const sn = str(r['Subappaltatore']);
    if (sn) e.subNames.add(sn);
    e.costoSub += toNumber(r['Costo Totale Subappaltato']);
  }
  const f = e.fornitore ? null : str(r['Fornitore']);
  if (f) e.fornitore = normalizeFornitore(f);
}

// "Oggetto Fornitura" aggregato per file sorgente: subappalto, modalità e fornitore.
function readOggettoFornitura(wb: Workbook): Map<string, OfEntry> {
  const byFile = new Map<string, OfEntry>();
  const sheet = findSheet(wb, 'Oggetto Fornitura', 'Oggetto');
  if (!sheet) return byFile;
  for (const r of sheetRows(wb, sheet, 0)) {
    const file = str(r['File Sorgente']);
    if (!file) continue;
    const e = byFile.get(file) ?? newOfEntry();
    addOfRow(e, r);
    byFile.set(file, e);
  }
  return byFile;
}

// Un IF dalla riga di "Generalità Intervento"; null se manca il numero o il titolo.
function rowToIntervento(r: Record<string, unknown>, of: OfEntry | undefined, cls: Classificazione | undefined): Intervento | null {
  const numero_if = strId(r['Numero IF']);
  const titolo = str(r['Titolo Intervento']);
  if (!numero_if || !titolo) return null;
  const bdo = bdoFromCell(r['Codice Ultimo BDO']);
  const hasBdo = bdo != null;
  return {
    numero_if,
    bdo,
    titolo,
    // L'ambito è quello compilato a mano (Anagrafica IF / Ambiti), non la «Macro Classe»
    // del contratto; senza classificazione resta null (in dashboard "Non classificato").
    ambito: cls?.ambito ?? null,
    fornitore: of?.fornitore || normalizeFornitore(String(r['Ref. Fornitore - Mail'] ?? '')),
    ref_aria: str(r['Ref. ARIA - Nome Cognome']),
    ref_fornitore: str(r['Ref. Fornitore - Nome Cognome']),
    importo: toNumber(r['Importo Intervento']),
    revenue_anno: 0,
    rev_mesi: Array(12).fill(0),
    cons_mesi: Array(12).fill(0),
    modalita_if: of && of.modalita.size ? [...of.modalita].join(' + ') : null,
    attivazione: cls?.attivazione ?? 'NO',
    stato: hasBdo ? 'approvato' : 'non elaborato',
    has_bo: hasBdo,
    pdc: 'nd',
    v_apertura: 'nd',
    v_sal: 'nd',
    bef: 'nd',
    subappalto: of?.sub ?? false,
    subappaltatore: of ? [...of.subNames] : [],
    costo_subappalto: of?.costoSub ?? 0,
    data_assegnazione: toISODate(r['Data Assegnazione IF']),
    data_inizio: toISODate(r['Data Inizio Attività']),
    data_fine: toISODate(r['Data Fine Attività']),
    azione: null,
    note_operative: null,
    edited_manually: false,
    last_edited_at: null,
    last_edited_by: null,
  };
}

function readInterventi(wb: Workbook): Intervento[] {
  const sheet = findSheet(wb, 'Generalità Intervento', 'Generalità');
  if (!sheet) return [];
  const ofByFile = readOggettoFornitura(wb);
  const classificazioni = readClassificazioni(wb);
  const out: Intervento[] = [];
  for (const r of sheetRows(wb, sheet, 0)) {
    const file = str(r['File Sorgente']);
    const numero_if = strId(r['Numero IF']);
    const i = rowToIntervento(r, file ? ofByFile.get(file) : undefined, numero_if ? classificazioni.get(numero_if) : undefined);
    if (i) out.push(i);
  }
  return out;
}

// Parse the Aggregatore Modulo 106 workbook: GdL -> seniority distribution,
// Generalità (+ Oggetto Fornitura) -> interventi with modalità/subappalto.
export function parseAggregatore(input: ArrayBuffer | Buffer): AggregatoreResult {
  const wb = readWorkbook(input);
  const interventi = readInterventi(wb);
  // La modalità che "Oggetto Fornitura" non riporta si ricava dai codici del GdL; quella già
  // presente non viene mai sostituita.
  const gdl = parseGdl(wb);
  const modalita = modalitaFromGdl(gdl);
  const completati = interventi.map((i) => (i.modalita_if ? i : { ...i, modalita_if: modalita.get(i.numero_if) ?? null }));
  return { seniority: readSeniority(wb), interventi: completati, gdl, fornitura: parseFornitura(wb) };
}
