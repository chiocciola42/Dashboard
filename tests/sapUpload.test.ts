import { describe, expect, it } from 'vitest';
import { chunkByBdo, uploadSapRows } from '@/lib/sapClient';
import { sanitizeRows, MAX_ROWS_PER_REQUEST } from '@/lib/sapPayload';

describe('chunkByBdo', () => {
  it('non spezza mai un BdO su due blocchi', () => {
    const rows = [
      ...Array.from({ length: 6 }, () => ({ bdo: 'A' })),
      ...Array.from({ length: 6 }, () => ({ bdo: 'B' })),
      ...Array.from({ length: 3 }, () => ({ bdo: 'A' })),
    ];
    const blocks = chunkByBdo(rows, 10);
    expect(blocks.map((b) => b.length)).toEqual([9, 6]);
    for (const b of blocks) expect(new Set(b.map((r) => r.bdo)).size).toBe(1);
  });

  it('un BdO più grande del limite resta in un solo blocco', () => {
    const blocks = chunkByBdo(Array.from({ length: 25 }, () => ({ bdo: 'X' })), 10);
    expect(blocks).toHaveLength(1);
  });
});

describe('uploadSapRows', () => {
  it('invia i blocchi in ordine con part/parts e si ferma al primo errore', async () => {
    const calls: { part: number; parts: number }[] = [];
    const fetchImpl = (async (_u: string, init: RequestInit) => {
      const b = JSON.parse(String(init.body));
      calls.push({ part: b.part, parts: b.parts });
      return new Response(JSON.stringify(b.part === 2 ? { ok: false, error: 'boom' } : { ok: true, bdo: 1 }), { status: b.part === 2 ? 500 : 200 });
    }) as unknown as typeof fetch;
    const rows = [...Array(1500).fill({ bdo: 'A' }), ...Array(1500).fill({ bdo: 'B' }), { bdo: 'C' }];
    const out = await uploadSapRows({ kind: 'pdc', rows, filename: 'f.xlsx', fetchImpl });
    expect(calls.map((c) => c.part)).toEqual([1, 2]);
    expect(out).toMatchObject({ ok: false, error: 'boom', blocchi: 1 });
  });
});

describe('sanitizeRows', () => {
  it('scarta righe senza chiavi e normalizza i tipi', () => {
    const r = sanitizeRows('pdc', [
      { bdo: ' 1 ', posizione: '1', periodo: '01/2026', importo_avanzamento: 'x', fornitore: 5 },
      { bdo: '', posizione: '1', periodo: '01/2026' },
    ]);
    expect(r.ok && 'parsed' in r && r.parsed.rows).toEqual([
      expect.objectContaining({ bdo: '1', importo_avanzamento: 0, fornitore: null }),
    ]);
  });
  it('rifiuta payload non array e troppo grandi', () => {
    expect(sanitizeRows('bef', {}).ok).toBe(false);
    expect(sanitizeRows('bef', new Array(MAX_ROWS_PER_REQUEST + 1).fill({})).ok).toBe(false);
  });
});
