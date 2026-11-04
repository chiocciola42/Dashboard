// Pure helpers shared by the admin "Gestione dati" panels.

// Coerce any value to a finite number (NaN / undefined / garbage -> 0).
export const n = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

// Always a 12-slot calendar-ordered series (Gen..Dic), missing / bad slots = 0.
export const v12 = (a?: number[] | null): number[] => {
  const out: number[] = Array(12).fill(0);
  if (Array.isArray(a)) for (let i = 0; i < 12; i++) out[i] = n(a[i]);
  return out;
};

// Cell text for the DB table viewer: null -> em dash, objects -> JSON.
export function fmtCell(v: unknown): string {
  if (v == null) return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
