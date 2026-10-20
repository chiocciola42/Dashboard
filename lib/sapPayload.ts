import type { BefRow, ParsedSap, PdcRow, VerbaleRow, VerbaleTipo } from './parsers/sap';
import type { IfRow } from './importer';

// Validazione del payload JSON dell'upload: le righe arrivano dal browser e
// vanno ricondotte ai tipi attesi prima di toccare il database.
export const MAX_ROWS_PER_REQUEST = 5000;

const s = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const numOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});

export const SAP_KINDS = ['pdc', 'bef', 'apertura', 'sal', 'subentro', 'if'] as const;
export type UploadKind = (typeof SAP_KINDS)[number];

export function sanitizeRows(
  kind: UploadKind,
  raw: unknown,
): { ok: true; parsed: ParsedSap } | { ok: true; ifRows: IfRow[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) return { ok: false, error: 'rows deve essere un array' };
  if (raw.length > MAX_ROWS_PER_REQUEST) return { ok: false, error: `Massimo ${MAX_ROWS_PER_REQUEST} righe per richiesta` };

  if (kind === 'if') {
    const ifRows: IfRow[] = [];
    for (const x of raw) {
      const r = rec(x);
      const numero_if = s(r.numero_if);
      if (!numero_if) continue;
      ifRows.push({
        numero_if,
        bdo: s(r.bdo),
        titolo: s(r.titolo),
        ambito: s(r.ambito),
        modalita: s(r.modalita),
        azione: s(r.azione),
        note: s(r.note),
      });
    }
    return { ok: true, ifRows };
  }

  if (kind === 'pdc') {
    const rows: PdcRow[] = [];
    for (const x of raw) {
      const r = rec(x);
      const bdo = s(r.bdo), posizione = s(r.posizione), periodo = s(r.periodo);
      if (!bdo || !posizione || !periodo) continue;
      rows.push({
        bdo, posizione, periodo,
        descrizione: s(r.descrizione),
        importo_posizione: numOrNull(r.importo_posizione),
        codice_pdc: s(r.codice_pdc),
        stato: s(r.stato),
        prestazione: s(r.prestazione),
        importo_avanzamento: num(r.importo_avanzamento),
        data_approvazione: s(r.data_approvazione),
        contratto: s(r.contratto),
        fornitore: s(r.fornitore),
      });
    }
    return { ok: true, parsed: { kind, rows } };
  }

  if (kind === 'bef') {
    const rows: BefRow[] = [];
    for (const x of raw) {
      const r = rec(x);
      const bdo = s(r.bdo);
      if (!bdo) continue;
      rows.push({
        bdo,
        descrizione: s(r.descrizione),
        linea_ordine: s(r.linea_ordine) ?? '',
        benestare: s(r.benestare) ?? '',
        periodo: s(r.periodo),
        ricezione: s(r.ricezione),
        linea_ricezione: s(r.linea_ricezione),
        importo: num(r.importo),
        fattura: s(r.fattura),
        data_fattura: s(r.data_fattura),
        data_pagamento: s(r.data_pagamento),
        contratto: s(r.contratto),
        fornitore: s(r.fornitore),
      });
    }
    return { ok: true, parsed: { kind, rows } };
  }

  const tipo: VerbaleTipo = kind;
  const rows: VerbaleRow[] = [];
  for (const x of raw) {
    const r = rec(x);
    const bdo = s(r.bdo);
    if (!bdo) continue;
    rows.push({
      tipo, bdo,
      descrizione: s(r.descrizione),
      codifica: s(r.codifica) ?? '',
      periodo: s(r.periodo),
      stato: s(r.stato),
      fornitore: s(r.fornitore),
      data_firma: s(r.data_firma),
      dettagli: rec(r.dettagli),
    });
  }
  return { ok: true, parsed: { kind: tipo, rows } };
}
