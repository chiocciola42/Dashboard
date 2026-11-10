// Canonical domain types — field names mirror the original static dashboard's
// embedded DATA object so the rendering logic ports across directly.

export type DocStatus = 'ok' | 'ko' | 'prog' | 'nd'; // OK | Mancante | In corso | N/D

// --- Authentication / users -------------------------------------------------
export type Role = 'ADMIN' | 'USER' | 'USERPLUS';
export type UserStatus = 'pending' | 'approved' | 'rejected';

// User shape exposed to the client (never includes password_hash).
export type SafeUser = {
  id: number;
  email: string;
  name: string | null;
  role: Role;
  status: UserStatus;
  created_at: string | null;
  approved_at: string | null;
};

export type Intervento = {
  numero_if: string;
  bdo: string | null;
  titolo: string;
  ambito: string | null;
  fornitore: string; // 'Intellera' | 'Deloitte' | ...
  ref_aria: string | null;
  ref_fornitore: string | null;
  importo: number;
  // Monthly profiles of ONE calendar year — the `anno` the data was loaded for
  // (DashboardData.anno). They are not columns of the intervento: they live in
  // intervento_mesi, one row per (IF, anno, mese), and are overlaid on read.
  revenue_anno: number; // Σ rev_mesi (derived, never stored)
  rev_mesi: number[]; // length 12 (revenue per month, Gen..Dic)
  cons_mesi: number[]; // length 12 (consuntivazione/actuals per month, Gen..Dic)
  modalita_if: string | null;
  attivazione: string | null; // 'SI' | 'NO'
  stato: string; // 'approvato' | 'non elaborato'
  has_bo: boolean;
  pdc: DocStatus;
  v_apertura: DocStatus;
  v_sal: DocStatus;
  bef: DocStatus;
  subappalto: boolean;
  subappaltatore: string[];
  costo_subappalto: number;
  data_assegnazione: string | null;
  data_inizio: string | null;
  data_fine: string | null;
  azione: string | null;
  note_operative: string | null;
  edited_manually: boolean;
  last_edited_at: string | null;
  last_edited_by: string | null;
};

export type Seniority = {
  figura: string;
  code: string;
  gg: number;
  tariffa: number | null;
};

export type ModalitaAgg = {
  mod: string; // A_corpo | A_canone | A_consumo
  n: number;
  costo: number;
};

export type RtiPartner = {
  name: string;
  pct: number;
  quota: number;
  impegnato: number;
};

export type RtiConfig = {
  ceiling: number;
  partners: RtiPartner[];
  tot_impegnato: number;
  erosione_2026: number;
};

export type Timeline = {
  mesi: string[];
  revenue_2026: number[];
  consuntivazione_2026: number[];
  anno: number;
};

// --- Multi-year revenue (F-2) ----------------------------------------------
// Monthly fact anchored to the CALENDAR year (anno) and calendar month
// (mese 1..12). This single shape supports both the solar year (Gen–Dic) and
// the fiscal year (Set–Ago, which spans two calendar years) at monthly,
// quarterly and annual grain — see lib/fiscal.ts.
export type TimelineMonth = {
  anno: number;
  mese: number; // 1..12 (calendar)
  revenue: number;
  consuntivato: number;
};

export type MultiYearTimeline = {
  months: TimelineMonth[];
  years: number[]; // calendar years present, ascending
};

// Monthly total of `bef_records.importo_ricezione` già fatturato, grouped by
// the calendar month of `data_fattura` (rows without a `data_fattura` — ancora
// da emettere o in attesa — are excluded: non hanno una data su cui
// collocarle).
export type BefMonthly = {
  anno: number;
  mese: number; // 1..12 (calendar)
  totale: number;
};

// "Fatturabile reale": importi BEF (`importo_ricezione`) collocati nel mese del
// `periodo_competenza`, qualunque sia lo stato della fattura. Le righe il cui
// periodo non è leggibile non hanno un mese: restano fuori dalla serie e sono
// contate a parte, così il grafico può dichiararlo.
export type BefFatturabile = {
  monthly: BefMonthly[];
  senzaPeriodo: { n: number; totale: number };
};

// Portfolio-level totals of `bef_records.importo_ricezione` (no period filter).
// `fatturabile` + `fatturatoInAttesa` + `fatturatoEmesso` sono mutuamente
// esclusive ed esaustive (ogni riga BEF ricade in una e una sola); `fatturatoIncassato`
// NON è una quarta voce da sommare alle altre — è un sottoinsieme di
// `fatturatoEmesso` (le fatture emesse già incassate) — vedi computeBefAggregates
// in lib/befStore.ts.
export type BefAggregates = {
  fatturabile: number; // senza numero fattura: da emettere
  fatturatoInAttesa: number; // numero fattura, senza data fattura: emessa, non ancora approvata dal cliente
  fatturatoEmesso: number; // numero + data fattura: emessa, incassata o meno (totale fatturato a oggi)
  fatturatoIncassato: number; // sottoinsieme di fatturatoEmesso: numero + data fattura + data pagamento
};

export type Meta = {
  cig: string;
  contratto: string;
  odag: string;
  generato: string;
  contract_date: string;
  valid_to: string;
  months: number;
};

export type BefRecord = {
  num_bdo: string | null;
  descrizione: string | null;
  numero_linea_ordine: string | null;
  periodo_competenza: string | null;
  fornitore_reale: string | null;
  importo_ricezione: number | null;
  num_fattura: string | null;
  data_fattura: string | null;
  data_pagamento: string | null;
};

export type VerbaleChiusura = {
  num_bdo: string | null;
  descrizione: string | null;
  stato_verbale: string | null;
  fornitore: string | null;
  roi: string | null;
  data_firma_roi: string | null;
};

// Row from the "REPORT Bdo" export (stato workflow approvativo per BDO).
// num_bdo ("Numero BDO") is the business key.
export type ReportBdoRecord = {
  num_bdo: string;
  descrizione_bdo: string | null;
  nome_file_pif_if: string | null;
  descrizione_pif_if: string | null;
  codifica_documento: string | null;
  stato_documento: string | null;
  divisione: string | null;
  centro_costo: string | null;
  ultima_pif_approvata: string | null;
  data_caricamento: string | null;
  utente_caricamento: string | null;
  fornitore: string | null;
  roi: string | null;
  data_invio_roi: string | null;
  data_approvazione_roi: string | null;
  data_rifiuto_roi: string | null;
  pmo: string | null;
  data_invio_pmo: string | null;
  data_approvazione_pmo: string | null;
  data_rifiuto_pmo: string | null;
  ctrm: string | null;
  data_invio_ctrm: string | null;
  data_approvazione_ctrm: string | null;
  data_rifiuto_ctrm: string | null;
  versione_corrente: string | null;
  data_versione_corrente: string | null;
  data_decorrenza: string | null;
};

// Row from the "REPORT Rdi" export (Richieste di Intervento). numero_rdi
// ("Numero RDI") is the business key.
export type ReportRdiRecord = {
  numero_rdi: string;
  descrizione_rdi: string | null;
  nome_file_pif_if: string | null;
  codifica_documento: string | null;
  stato_documento: string | null;
  divisione: string | null;
  centro_costo: string | null;
  ultima_pif_approvata: string | null;
  descrizione_pif_if: string | null;
  data_caricamento: string | null;
  utente_caricamento: string | null;
  fornitore: string | null;
  roi: string | null;
  data_invio_roi: string | null;
  data_rifiuto_roi: string | null;
  data_approvazione_roi: string | null;
};

// Row from the "REPORT Apertura" export (verbali di apertura).
export type VerbaleAperturaRecord = {
  num_bdo: string | null;
  descrizione: string | null;
  nome_file: string | null;
  codifica_documento: string | null;
  stato_verbale: string | null;
  periodo_competenza: string | null;
  divisione: string | null;
  centro_costo: string | null;
  fornitore: string | null;
  utente_caricamento_fornitore: string | null;
  data_firma_fornitore: string | null;
  roi: string | null;
  data_inserimento_verbale_non_sottomesso: string | null;
  data_sottomissione_verbale_fornitore: string | null;
  data_firma_roi: string | null;
  data_rifiuto_roi: string | null;
  data_invio_roi: string | null;
};

// Row from the "REPORT Sal" export (verbali SAL). Multiple rows per num_bdo
// are expected (periodic SAL).
export type VerbaleSalRecord = {
  num_bdo: string | null;
  descrizione: string | null;
  nome_file: string | null;
  codifica_documento: string | null;
  stato_verbale: string | null;
  periodo_competenza: string | null;
  conforme: string | null;
  motivo_conformita: string | null;
  criticita: string | null;
  motivazione_criticita: string | null;
  livelli_servizio_rispettati: string | null;
  divisione: string | null;
  centro_costo: string | null;
  fornitore: string | null;
  utente_caricamento_fornitore: string | null;
  data_firma_fornitore: string | null;
  roi: string | null;
  data_inserimento_verbale_non_sottomesso: string | null;
  data_sottomissione_verbale_fornitore: string | null;
  data_firma_roi: string | null;
  data_rifiuto_roi: string | null;
  data_invio_roi: string | null;
};

// Row from the "REPORT Pdc" export (Prese in Carico). Multiple rows per
// num_bdo are expected: one per posizione BDO x periodo di competenza, so
// this is the monthly detail behind Intervento.pdc. num_bdo is the join key
// to interventi.bdo (same as verbali_sal / verbali_apertura).
export type ReportPdcRecord = {
  num_bdo: string;
  posizione_bdo: string | null;
  descrizione_posizione: string | null;
  importo_posizione: number | null;
  codice_pdc: string | null;
  periodo_pdc: string | null; // "MM/YYYY"
  data_creazione: string | null;
  utente_caricamento: string | null;
  codifica_documento: string | null;
  stato_pdc: string | null;
  divisione: string | null;
  centro_costo: string | null;
  fornitore_rti: string | null;
  roi: string | null;
  data_invio_roi: string | null;
  data_rifiuto_roi: string | null;
  data_approvazione_roi: string | null;
  fornitore_prestazione: string | null;
  service_line: string | null;
  tipo_fornitura: string | null;
  rdi: string | null;
  posizione_rdi: string | null;
  subappalto: string | null;
  subappaltatore: string | null;
  costo_subappalto: number | null;
};

// One month of one intervento in one calendar year (row of intervento_mesi).
export type MonthFact = {
  numero_if: string;
  anno: number;
  mese: number; // 1..12
  revenue: number;
  consuntivo: number;
};

// Aggregated payload returned by GET /api/data
import type { Controlli } from './riconciliazione';
import type { QuotePartner } from './ripartizionePartner';

export type DashboardData = {
  // Calendar year the per-intervento monthly profiles refer to, and the years
  // that have data (ascending, always including `anno`).
  anno: number;
  anni: number[];
  meta: Meta;
  fornitori_filter: string[];
  interventi: Intervento[];
  seniority: Seniority[];
  modalita: ModalitaAgg[];
  rti: RtiConfig;
  quota_val: Record<string, number>;
  timeline: Timeline;
  timeline_my: MultiYearTimeline;
  bef_monthly: BefMonthly[];
  bef_fatturabile: BefFatturabile;
  bef_aggregates: BefAggregates;
  controlli: Controlli;
  // Ripartizione dell'importo di ogni IF fra le aziende dell'RTI (da Oggetto Fornitura).
  quote_partner?: QuotePartner;
  kpi: Kpi;
  revenue_mensile: { mese: string; intellera: number; deloitte: number }[];
  distribuzione_ambito: { ambito: string; count: number; valore: number }[];
};

export type Kpi = {
  count: number;
  totale: number;
  medio: number;
  bo_emessi: number;
  bo_attesa: number;
  intellera: number;
  deloitte: number;
};

// Subset of fields editable via the UI (PUT / POST)
export type InterventoInput = Partial<
  Omit<Intervento, 'revenue_anno' | 'rev_mesi' | 'cons_mesi' | 'subappaltatore'> & {
    rev_mesi: number[];
    cons_mesi: number[];
    subappaltatore: string[];
    // Calendar year `rev_mesi` / `cons_mesi` refer to (default: the portfolio's
    // current year, see lib/mesiStore.ts#resolveAnno).
    anno: number;
  }
>;

// Riga del foglio "GdL - Gruppo di Lavoro" dell'Aggregatore: giornate REALI di una
// figura professionale (o di una risorsa nominata) in un IF. Una riga per attività e
// figura: più persone della stessa figura danno più righe identiche, che NON vanno unite.
// Il tipo si deduce dal prefisso del codice: MLS = milestone (a corpo), CAN = canone,
// CONS = consulenza a misura (risorse nominate).
export type GdlTipo = 'corpo' | 'canone' | 'consumo';
export type GdlRiga = {
  numero_if: string;
  codice: string | null; // es. MLS01, CAN02, CONS01
  tipo: GdlTipo | null; // null se il prefisso del codice non è riconosciuto
  descrizione: string | null;
  figura: string | null;
  nome_risorsa: string | null;
  gg: number | null; // null = mancante o non numerico: mai convertito in 0
  azienda: string | null; // partner RTI (nome canonico) o ragione sociale se sconosciuta
};

// Riga del foglio "Oggetto Fornitura" dell'Aggregatore: costo contrattuale di una linea di
// fornitura (milestone, canone o prestazione a misura) di un IF. La somma dei costi complessivi
// delle righe di un IF è l'importo dell'IF; il costo di una milestone è la somma delle sue righe.
export type FornituraRiga = {
  numero_if: string;
  num_linea: string | null;
  modalita: GdlTipo | null;
  codice: string | null; // codice milestone/attività (MLS01, CAN02…); alcune righe ne sono prive
  descrizione: string | null; // descrizione della prestazione
  quantita: number | null;
  costo_unitario: number | null;
  costo_complessivo: number | null; // null = mancante o non numerico: mai convertito in 0
  fornitore: string | null; // partner RTI (nome canonico) o ragione sociale se sconosciuta
};

// Per-IF/BO resource allocation row (figure professionali, gruppi, giorni uomo).
export type IfRisorsa = {
  id?: number;
  numero_if: string;
  figura: string | null;
  sigla: string | null;
  gruppo: string | null;
  gg: number | null;
  tariffa_giornaliera: number | null;
};

// Per-IF/BO BEF row.
export type BefRow = {
  id?: number;
  numero_if: string;
  num_bdo: string | null;
  descrizione: string | null;
  numero_linea_ordine: string | null;
  periodo_competenza: string | null;
  fornitore_reale: string | null;
  importo_ricezione: number | null;
  num_fattura: string | null;
  data_fattura: string | null;
  data_pagamento: string | null;
};
