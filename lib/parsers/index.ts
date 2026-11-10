import type {
  Intervento,
  BefRecord,
  VerbaleChiusura,
  Seniority,
  GdlRiga,
  FornituraRiga,
  ReportBdoRecord,
  ReportRdiRecord,
  VerbaleAperturaRecord,
  VerbaleSalRecord,
  ReportPdcRecord,
  MonthFact,
} from '../types';
import { parseIF } from './parseIF';
import { parseBEF } from './parseBEF';
import { parseChiusura } from './parseChiusura';
import { parseAggregatore } from './parseAggregatore';
import { parseDashboard } from './parseDashboard';
import { parseReportBdo, findReportBdoSheet } from './parseReportBdo';
import { parseReportRdi, findReportRdiSheet } from './parseReportRdi';
import { parseVerbaliApertura, findVerbaliAperturaSheet } from './parseVerbaliApertura';
import { parseVerbaliSal, findVerbaliSalSheet } from './parseVerbaliSal';
import { parseReportPdc, findReportPdcSheet } from './parseReportPdc';
import { readWorkbook } from './util';

export type FileKind =
  | 'if'
  | 'bef'
  | 'chiusura'
  | 'aggregatore'
  | 'dashboard'
  | 'report_bdo'
  | 'report_rdi'
  | 'verbali_apertura'
  | 'verbali_sal'
  | 'report_pdc'
  | 'unknown';

export function detectKind(filename: string): FileKind {
  const n = filename.toLowerCase();
  if (n.includes('dashboard')) return 'dashboard';
  if (n.includes('aggregatore')) return 'aggregatore';
  if (n.includes('chiusura')) return 'chiusura';
  if (n.includes('bef')) return 'bef';
  if (n.includes('if_aria') || n.includes('monitoraggio') || n.includes('dettaglio'))
    return 'if';
  return 'unknown';
}

export type ParseOutput = {
  kind: FileKind;
  interventi?: Intervento[];
  bef?: BefRecord[];
  chiusura?: VerbaleChiusura[];
  seniority?: Seniority[];
  gdl?: GdlRiga[];
  fornitura?: FornituraRiga[];
  reportBdo?: ReportBdoRecord[];
  reportRdi?: ReportRdiRecord[];
  verbaliApertura?: VerbaleAperturaRecord[];
  verbaliSal?: VerbaleSalRecord[];
  reportPdc?: ReportPdcRecord[];
  // Monthly revenue per IF and year (Dashboard workbook only).
  mesi?: MonthFact[];
};

const RECORD_LISTS = [
  'interventi',
  'bef',
  'chiusura',
  'seniority',
  'gdl',
  'fornitura',
  'reportBdo',
  'reportRdi',
  'verbaliApertura',
  'verbaliSal',
  'reportPdc',
] as const;

// Number of records a parse produced, across every list the kind can fill.
export function countRecords(parsed: ParseOutput): number {
  return RECORD_LISTS.reduce((n, k) => n + (parsed[k]?.length ?? 0), 0);
}

export const EMPTY_IMPORT_MSG =
  'Nessuna riga importabile nel file: foglio vuoto, intestazioni non riconosciute o nessuna riga del RTI Intellera.';

// Fails an import that would "succeed" while writing nothing (and still bump the
// "dati al" date): an export with an unexpected layout must be reported, not
// accepted silently.
export function emptyImportError(parsed: ParseOutput): string | null {
  if (parsed.kind === 'unknown') return null;
  return countRecords(parsed) === 0 ? EMPTY_IMPORT_MSG : null;
}

export function parseFile(filename: string, buf: ArrayBuffer | Buffer): ParseOutput {
  const kind = detectKind(filename);
  switch (kind) {
    case 'if':
      return { kind, interventi: parseIF(buf) };
    case 'bef':
      return { kind, bef: parseBEF(buf) };
    case 'chiusura':
      return { kind, chiusura: parseChiusura(buf) };
    case 'aggregatore': {
      const { seniority, interventi, gdl, fornitura } = parseAggregatore(buf);
      return { kind, seniority, interventi, gdl, fornitura };
    }
    case 'dashboard': {
      const { seniority, interventi, mesi } = parseDashboard(buf);
      return { kind, seniority, interventi, mesi };
    }
    default: {
      // Fall back to content sniffing: some exports (master Dashboard
      // workbook, "REPORT Bdo", "REPORT Rdi", "REPORT Apertura", "REPORT Sal")
      // have filenames that don't follow a fixed pattern (e.g. system-generated
      // timestamps/codes), so they're identified by their sheets instead.
      try {
        const wb = readWorkbook(buf);
        const has = (name: string) => wb.SheetNames.some((s) => s === name);
        if (has('TIMELINE_REVENUE') && has('DATI')) {
          const { seniority, interventi, mesi } = parseDashboard(wb);
          return { kind: 'dashboard', seniority, interventi, mesi };
        }
        if (findReportBdoSheet(wb)) {
          return { kind: 'report_bdo', reportBdo: parseReportBdo(wb) };
        }
        if (findReportRdiSheet(wb)) {
          return { kind: 'report_rdi', reportRdi: parseReportRdi(wb) };
        }
        if (findVerbaliAperturaSheet(wb)) {
          return { kind: 'verbali_apertura', verbaliApertura: parseVerbaliApertura(wb) };
        }
        if (findVerbaliSalSheet(wb)) {
          return { kind: 'verbali_sal', verbaliSal: parseVerbaliSal(wb) };
        }
        if (findReportPdcSheet(wb)) {
          return { kind: 'report_pdc', reportPdc: parseReportPdc(wb) };
        }
      } catch {
        // not a spreadsheet we can read -> report as unknown below
      }
      return { kind: 'unknown' };
    }
  }
}

export {
  parseIF,
  parseBEF,
  parseChiusura,
  parseAggregatore,
  parseDashboard,
  parseReportBdo,
  parseReportRdi,
  parseVerbaliApertura,
  parseVerbaliSal,
  parseReportPdc,
};
