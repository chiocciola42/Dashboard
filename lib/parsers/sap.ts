import {
  readWorkbook,
  sheetRows,
  findSheet,
  looseGetter,
  toNumber,
  toISODate,
  str,
  strId,
  type Workbook,
} from './util';
import { COL } from './columns';

// Parser v2 degli export SAP per il modello Contratto → Fornitore → BdO/IF.
// A differenza dei parser legacy non filtrano per fornitore: ogni riga viene
// restituita con il proprio contratto ("Fornitore RTI") e il proprio fornitore
// (BEF: "Fornitore Reale", PDC: "Fornitore Prestazione", verbali: "Fornitore").

export type PdcRow = {
  bdo: string;
  posizione: string;
  descrizione: string | null;
  importo_posizione: number | null;
  codice_pdc: string | null;
  periodo: string;
  stato: string | null;
  prestazione: string | null;
  importo_avanzamento: number;
  data_approvazione: string | null;
  contratto: string | null;
  fornitore: string | null;
};

export type BefRow = {
  bdo: string;
  descrizione: string | null;
  linea_ordine: string;
  benestare: string;
  periodo: string | null;
  ricezione: string | null;
  linea_ricezione: string | null;
  importo: number;
  fattura: string | null;
  data_fattura: string | null;
  data_pagamento: string | null;
  contratto: string | null;
  fornitore: string | null;
};

export type VerbaleTipo = 'apertura' | 'sal' | 'subentro';

export type VerbaleRow = {
  tipo: VerbaleTipo;
  bdo: string;
  descrizione: string | null;
  codifica: string;
  periodo: string | null;
  stato: string | null;
  fornitore: string | null;
  data_firma: string | null;
  dettagli: Record<string, unknown>;
};

export type SapKind = 'pdc' | 'bef' | VerbaleTipo;

const SHEETS: Record<SapKind, string[]> = {
  pdc: ['REPORT Pdc', 'REPORT PDC'],
  bef: ['REPORT Bef', 'REPORT BEF'],
  apertura: ['REPORT Apertura'],
  sal: ['REPORT Sal', 'REPORT SAL'],
  subentro: ['REPORT Subentro'],
};

// Riconosce il tipo di export dal foglio dati (il nome del file SAP è
// "<Tipo>_<timestamp>_<n>.xlsx" ma non è un contratto: ci si fida del foglio).
export function detectSapKind(wb: Workbook): SapKind | null {
  for (const kind of Object.keys(SHEETS) as SapKind[]) {
    if (findSheet(wb, ...SHEETS[kind])) return kind;
  }
  return null;
}

function sheetOf(wb: Workbook, kind: SapKind): string | null {
  return findSheet(wb, ...SHEETS[kind]);
}

export function parsePdcV2(wb: Workbook): PdcRow[] {
  const sheet = sheetOf(wb, 'pdc');
  if (!sheet) return [];
  const out: PdcRow[] = [];
  for (const r of sheetRows(wb, sheet, 0)) {
    const g = looseGetter(r);
    const bdo = strId(g(...COL.bdo));
    if (!bdo) continue;
    const posizione = strId(g('Posizione BDO'));
    const periodo = str(g('Periodo PDC'));
    if (!posizione || !periodo) continue;
    const imp = g('Importo Posizione');
    out.push({
      bdo,
      posizione,
      descrizione: str(g('Descrizione Posizione')),
      importo_posizione: imp == null || imp === '' ? null : toNumber(imp),
      codice_pdc: strId(g('Codice PDC')),
      periodo,
      stato: str(g('Stato della PDC')),
      prestazione: strId(g('Numero Prestazioni')),
      importo_avanzamento: toNumber(g('Importo avanzamento')),
      data_approvazione: toISODate(g('Data approvazione ROI')),
      contratto: str(g(...COL.contratto)),
      fornitore: str(g('Fornitore Prestazione')),
    });
  }
  return out;
}

export function parseBefV2(wb: Workbook): BefRow[] {
  const sheet = sheetOf(wb, 'bef');
  if (!sheet) return [];
  const out: BefRow[] = [];
  for (const r of sheetRows(wb, sheet, 0)) {
    const g = looseGetter(r);
    const bdo = strId(g(...COL.bdo));
    if (!bdo) continue;
    out.push({
      bdo,
      descrizione: str(g('Descrizione')),
      linea_ordine: strId(g('Numero Linea Ordine')) ?? '',
      benestare: strId(g('Benestare alla Fatturazione')) ?? '',
      periodo: str(g('Periodo Competenza', 'Mese competenza Verbale')),
      ricezione: strId(g('Numero Ricezione/Attestazione')),
      linea_ricezione: strId(g('Numero della linea di ricezione')),
      importo: toNumber(g('Importo Ricezione')),
      fattura: strId(g('Numero Fattura')),
      data_fattura: toISODate(g('Data Fattura')),
      data_pagamento: toISODate(g('Data Pagamento')),
      contratto: str(g(...COL.contratto)),
      fornitore: str(g('Fornitore Reale')) ?? null,
    });
  }
  return out;
}

export function parseVerbaliV2(wb: Workbook, tipo: VerbaleTipo): VerbaleRow[] {
  const sheet = sheetOf(wb, tipo);
  if (!sheet) return [];
  const out: VerbaleRow[] = [];
  for (const r of sheetRows(wb, sheet, 0)) {
    const g = looseGetter(r);
    const bdo = strId(g(...COL.bdo));
    if (!bdo) continue;
    out.push({
      tipo,
      bdo,
      descrizione: str(g('Descrizione')),
      codifica: str(g('Codifica numerica documento')) ?? '',
      periodo: str(g('Periodo competenza')),
      stato: str(g('Stato Verbale')),
      fornitore: str(g('Fornitore')),
      data_firma: toISODate(g('Data firma ROI')),
      dettagli: {
        nome_file: str(g('Nome file', 'Nome del file', 'Nome file verbale SAL')),
        divisione: str(g('Divisione')),
        centro_costo: str(g('Centro di Costo')),
        roi: str(g('ROI')),
        data_firma_fornitore: toISODate(g('Data firma fornitore')),
        data_invio_roi: toISODate(g('Data invio ROI')),
        data_rifiuto_roi: toISODate(g('Data rifiuto ROI')),
        ...(tipo === 'sal'
          ? {
              conforme: str(g('Conforme')),
              motivo_conformita: str(g('Motivo Conformità')),
              criticita: str(g('Criticità')),
              motivazione_criticita: str(g('Motivazione Criticità')),
              livelli_servizio_rispettati: str(g('Livelli di Servizio Rispettati')),
            }
          : {}),
      },
    });
  }
  return out;
}

export type ParsedSap =
  | { kind: 'pdc'; rows: PdcRow[] }
  | { kind: 'bef'; rows: BefRow[] }
  | { kind: VerbaleTipo; rows: VerbaleRow[] };

export function parseSapFile(buf: ArrayBuffer | Buffer | Uint8Array): ParsedSap | null {
  const wb = readWorkbook(buf);
  const kind = detectSapKind(wb);
  if (!kind) return null;
  if (kind === 'pdc') return { kind, rows: parsePdcV2(wb) };
  if (kind === 'bef') return { kind, rows: parseBefV2(wb) };
  return { kind, rows: parseVerbaliV2(wb, kind) };
}

// Nei report PDC/BEF "Fornitore RTI" identifica il CONTRATTO (es.
// "RTI 7-26 INTELLERA", "FG 1582-22 INTELLERA"). Alcune righe PDC lo lasciano
// vuoto o ci scrivono la ragione sociale del fornitore: queste non sono un
// contratto e non vanno trattate come tale.
export function isContrattoLabel(s: string | null | undefined): s is string {
  return !!s && /^(RTI|FG)\s/i.test(s.trim());
}

// Contratto di ogni BdO: il valore più frequente tra le etichette valide;
// a parità vince la prima fonte passata (BEF prima di PDC).
export function resolveContrattoPerBdo(
  sources: { bdo: string; contratto: string | null }[][],
): Map<string, string> {
  const counts = new Map<string, Map<string, number>>();
  for (const rows of sources) {
    for (const r of rows) {
      if (!isContrattoLabel(r.contratto)) continue;
      const c = r.contratto.trim();
      const m = counts.get(r.bdo) ?? new Map<string, number>();
      m.set(c, (m.get(c) ?? 0) + 1);
      counts.set(r.bdo, m);
    }
  }
  const out = new Map<string, string>();
  for (const [bdo, m] of counts) {
    let best: string | null = null;
    let n = 0;
    for (const [c, k] of m) if (k > n) (best = c), (n = k);
    if (best) out.set(bdo, best);
  }
  return out;
}
