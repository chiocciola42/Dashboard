import { beforeAll, describe, expect, it } from 'vitest';
import { applySchema } from '@/lib/db';
import { importSapFile } from '@/lib/importer';
import { getContratto, listContratti } from '@/lib/domain/contratti';
import { createTestDb } from './helpers/pglite';
import { workbook } from './helpers/xlsx';

const PDC_H = ['Numero BDO', 'Posizione BDO', 'Descrizione Posizione', 'Importo Posizione', 'Codice PDC', 'Periodo PDC', 'Stato della PDC', 'Fornitore RTI', 'Fornitore Prestazione', 'Numero Prestazioni', 'Importo avanzamento'];
const BEF_H = ['Numero BDO', 'Descrizione', 'Numero Linea Ordine', 'Fornitore RTI', 'Fornitore Reale', 'Benestare alla Fatturazione', 'Periodo Competenza', 'Numero Ricezione/Attestazione', 'Numero della linea di ricezione', 'Importo Ricezione', 'Numero Fattura', 'Data Fattura', 'Data Pagamento'];

const pdc = workbook({
  Richiesta: [['Titolo Report']],
  'REPORT Pdc': [
    PDC_H,
    [1001, 1, 'Pos A', 1000, 11, '01/2026', 'PDC Approvata', 'RTI 7-26 INTELLERA', 'Intellera SpA', 1, 300],
    [1001, 1, 'Pos A', 1000, 12, '02/2026', 'PDC Approvata', 'RTI 7-26 INTELLERA', 'Intellera SpA', 1, 200],
    [1001, 2, 'Pos B', 500, 13, '01/2026', 'PDC Approvata', '', 'Deloitte Srl', 2, 100],
    [2002, 1, 'Pos C', 800, 21, '01/2026', 'PDC Approvata', 'FG 1582-22 INTELLERA', 'Intellera SpA', 3, 400],
  ],
});
const bef = workbook({
  Richiesta: [['Titolo Report']],
  'REPORT Bef': [
    BEF_H,
    [1001, 'd', 1, 'RTI 7-26 INTELLERA', 'Intellera SpA', 'B1', '01/2026', 9, 1, 250, 'F1', '10/02/2026', '20/03/2026'],
    [1001, 'd', 2, 'RTI 7-26 INTELLERA', 'Deloitte Srl', 'B1', '01/2026', 9, 2, 50, null, null, null],
    [2002, 'd', 1, 'FG 1582-22 INTELLERA', 'Intellera SpA', 'B2', '01/2026', 8, 1, 400, 'F2', '10/02/2026', null],
  ],
});

describe('import SAP e cambio contratto', () => {
  let db: Awaited<ReturnType<typeof createTestDb>>['db'];
  beforeAll(async () => {
    ({ db } = await createTestDb());
    await applySchema(db as never);
    await importSapFile(db as never, 'PDC.xlsx', pdc, 't');
    await importSapFile(db as never, 'BEF.xlsx', bef, 't');
    await importSapFile(db as never, 'PDC.xlsx', pdc, 't'); // idempotente
  }, 60000);

  it('separa i dati dei due contratti', async () => {
    const l = await listContratti(db as never);
    expect(l.map((c) => c.codice)).toEqual(['FG 1582-22 INTELLERA', 'RTI 7-26 INTELLERA']);
    const [fg, rti] = l;
    expect(rti).toMatchObject({ n_bdo: 1, valore: 1500, avanzato: 600, bef: 300, fatturato: 250, incassato: 250, residuo: 900 });
    expect(fg).toMatchObject({ n_bdo: 1, valore: 800, avanzato: 400, bef: 400, fatturato: 400, incassato: 0 });
  });

  it('ripartisce per fornitore e il totale quadra col contratto', async () => {
    const l = await listContratti(db as never);
    const det = await getContratto(db as never, l.find((c) => c.codice.startsWith('RTI'))!.id);
    expect(det!.fornitori.map((f) => [f.nome, f.valore, f.avanzato])).toEqual([
      ['Intellera SpA', 1000, 500],
      ['Deloitte Srl', 500, 100],
    ]);
    expect(det!.fornitori.reduce((a, f) => a + f.valore, 0)).toBe(det!.contratto.valore);
  });

  it('una riga PDC senza etichetta contratto eredita quella del BdO', async () => {
    const l = await listContratti(db as never);
    expect(l.reduce((a, c) => a + c.n_bdo, 0)).toBe(2);
  });
});
