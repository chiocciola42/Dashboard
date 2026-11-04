import type { Intervento } from '@/lib/types';
import { buildCsv } from '@/lib/dettaglioIF';
import { downloadCsvFile } from '../shared/tableActions';

export { confirmAndDelete } from '../shared/tableActions';

// Saves the shown IFs as Dettaglio_IF.csv.
export function downloadDettaglioCsv(IFs: Intervento[]): void {
  downloadCsvFile('Dettaglio_IF.csv', buildCsv(IFs));
}
