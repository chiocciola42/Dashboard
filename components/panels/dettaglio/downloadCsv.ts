import type { Intervento } from '@/lib/types';
import { buildCsv } from '@/lib/dettaglioIF';

// Saves the shown IFs as Dettaglio_IF.csv through a temporary object URL
// (revoked shortly after the click so the download can start).
export function downloadDettaglioCsv(IFs: Intervento[]): void {
  const blob = new Blob([buildCsv(IFs)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'Dettaglio_IF.csv';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 800);
}

// Asks for confirmation, then deletes (soft-delete on the server).
export function confirmAndDelete(numeroIf: string, onDelete: (numero_if: string) => void): void {
  if (window.confirm(`Eliminare l'IF ${numeroIf}? (soft-delete)`)) onDelete(numeroIf);
}
