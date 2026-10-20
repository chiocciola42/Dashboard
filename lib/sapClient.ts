import type { IfRow } from './importer';
import type { Intervento } from './types';
import { MAX_ROWS_PER_REQUEST } from './sapPayload';

// Blocchi di righe da inviare a /api/upload/sap. Un BdO non viene mai spezzato
// su due blocchi: l'import rimpiazza le righe per BdO e il secondo blocco
// cancellerebbe quelle del primo.
export function chunkByBdo<T extends { bdo: string | null }>(rows: T[], max = 1500): T[][] {
  const limit = Math.min(max, MAX_ROWS_PER_REQUEST);
  const groups = new Map<string, T[]>();
  for (const r of rows) {
    const k = r.bdo ?? '';
    const g = groups.get(k);
    if (g) g.push(r);
    else groups.set(k, [r]);
  }
  const out: T[][] = [];
  let cur: T[] = [];
  for (const g of groups.values()) {
    if (cur.length && cur.length + g.length > limit) {
      out.push(cur);
      cur = [];
    }
    cur.push(...g);
  }
  if (cur.length) out.push(cur);
  return out;
}

export function ifRowsFrom(interventi: Intervento[]): IfRow[] {
  return interventi.map((i) => ({
    numero_if: i.numero_if,
    bdo: i.bdo ?? null,
    titolo: i.titolo ?? null,
    ambito: i.ambito ?? null,
    modalita: i.modalita_if ?? null,
    azione: i.azione ?? null,
    note: i.note_operative ?? null,
  }));
}

export type SapUploadOutcome = { ok: boolean; error?: string; righe: number; bdo: number; blocchi: number };

// Invia le righe a blocchi, in sequenza, aggiornando l'avanzamento.
export async function uploadSapRows(opts: {
  kind: string;
  rows: { bdo: string | null }[];
  filename: string;
  token?: string;
  onProgress?: (done: number, total: number) => void;
  fetchImpl?: typeof fetch;
}): Promise<SapUploadOutcome> {
  const f = opts.fetchImpl ?? fetch;
  const blocks = chunkByBdo(opts.rows);
  let bdo = 0;
  for (let i = 0; i < blocks.length; i++) {
    const res = await f('/api/upload/sap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(opts.token ? { 'x-upload-secret': opts.token } : {}) },
      body: JSON.stringify({
        kind: opts.kind, rows: blocks[i], filename: opts.filename,
        part: i + 1, parts: blocks.length, total: opts.rows.length,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; bdo?: number };
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error ?? `Errore ${res.status}`, righe: opts.rows.length, bdo, blocchi: i };
    }
    bdo += data.bdo ?? 0;
    opts.onProgress?.(i + 1, blocks.length);
  }
  return { ok: true, righe: opts.rows.length, bdo, blocchi: blocks.length };
}
