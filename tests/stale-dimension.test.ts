import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { readWorkbook } from '@/lib/parsers/util';
import { parseFile } from '@/lib/parsers';
import { workbook } from './helpers/xlsx';

// Alcuni export dichiarano `<dimension ref="A1:V1"/>` (solo intestazione) pur contenendo
// migliaia di righe: l'import risultava "riuscito" con 0 record. XLSX.write scarta le celle
// fuori da !ref, quindi il file viene scritto non compresso e il tag <dimension> sostituito
// con uno della stessa lunghezza (xlsx non verifica il CRC).
function withStaleDimension(sheets: Parameters<typeof workbook>[0], from: string, to: string): Buffer {
  const wb = XLSX.read(workbook(sheets), { type: 'buffer' });
  const raw = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', compression: false }) as Buffer);
  const needle = Buffer.from(`<dimension ref="${from}"/>`);
  const at = raw.lastIndexOf(needle);
  if (at < 0) throw new Error('dimension tag not found');
  Buffer.from(`<dimension ref="${to}"/>`).copy(raw, at);
  return raw;
}

describe('fogli con dimension obsoleta', () => {
  const rows = [
    ['Numero BDO', 'Descrizione', 'Fornitore RTI', 'Importo Ricezione'],
    ['2026330701', 'Attività A', 'RTI 7-26 Intellera', 100],
    ['2026330702', 'Attività B', 'RTI 7-26 Intellera', 200],
  ];

  it('readWorkbook estende il range a tutte le celle presenti', () => {
    const buf = withStaleDimension({ 'REPORT Bef': rows }, 'A1:D3', 'A1:D1');
    expect(XLSX.read(buf, { type: 'buffer' }).Sheets['REPORT Bef']['!ref']).toBe('A1:D1');
    expect(readWorkbook(buf).Sheets['REPORT Bef']['!ref']).toBe('A1:D3');
  });

  it('parseFile importa le righe di un BEF con dimension A1:D1', () => {
    const buf = withStaleDimension({ Richiesta: [['Titolo Report']], 'REPORT Bef': rows }, 'A1:D3', 'A1:D1');
    expect(parseFile('BEF_20261105.xlsx', buf).bef).toHaveLength(2);
  });
});
