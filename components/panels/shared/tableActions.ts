// Browser actions shared by the IF tables.

// Saves `csv` as a file through a temporary object URL (revoked shortly after
// the click so the download can start).
export function downloadCsvFile(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
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
