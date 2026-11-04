import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { applySchema } from '@/lib/db';
import { getIntervento, listInterventiBase, softDeleteIntervento, upsertInterventiFromUpload } from '@/lib/store';
import { createTestDb } from './helpers/pglite';
import { makeIf } from './helpers/fixtures';

// The upload upsert against a real Postgres: the path production takes (the
// in-memory twin is covered in tests/store.test.ts).
const state = vi.hoisted(() => ({ hasDB: true, db: null as unknown }));
vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>();
  return { ...actual, get hasDB() { return state.hasDB; }, getDb: () => state.db, ensureSchema: async () => {} };
});

let pg: PGlite;
beforeAll(async () => {
  const t = await createTestDb();
  pg = t.pg;
  state.db = t.db;
  await applySchema(t.db as never);
});
afterAll(async () => {
  await pg.close();
});
beforeEach(async () => {
  // keep the baseline seeded once; remove only what these tests create
  await pg.exec(`DELETE FROM interventi WHERE numero_if LIKE 'T%'`);
});

const ids = (xs: string[]) => [...xs].sort();

describe('upsertInterventiFromUpload (database)', () => {
  it('inserts new IF and reports them', async () => {
    const res = await upsertInterventiFromUpload([makeIf({ numero_if: 'T1', titolo: 'Uno' }), makeIf({ numero_if: 'T2', titolo: 'Due' })]);
    expect(res).toMatchObject({ inserted: 2, updated: 0, skipped: 0 });
    expect(ids(res.insertedIfs)).toEqual(['T1', 'T2']);
    expect(await getIntervento('T1')).toMatchObject({ titolo: 'Uno' });
  });

  it('updates an existing IF, keeping fields the file does not carry', async () => {
    await upsertInterventiFromUpload([makeIf({ numero_if: 'T1', titolo: 'Uno', ambito: 'Governance', importo: 10 })]);
    const res = await upsertInterventiFromUpload([makeIf({ numero_if: 'T1', titolo: 'Uno bis', ambito: null, importo: 99 })]);
    expect(res).toMatchObject({ inserted: 0, updated: 1, skipped: 0, updatedIfs: ['T1'] });
    expect(await getIntervento('T1')).toMatchObject({ titolo: 'Uno bis', ambito: 'Governance', importo: 99 });
  });

  it('skips manually edited IF unless forced', async () => {
    await upsertInterventiFromUpload([makeIf({ numero_if: 'T1', titolo: 'Uno' })]);
    await pg.exec(`UPDATE interventi SET edited_manually = true WHERE numero_if = 'T1'`);
    const skipped = await upsertInterventiFromUpload([makeIf({ numero_if: 'T1', titolo: 'Dal file' })]);
    expect(skipped).toMatchObject({ skipped: 1, skippedIfs: ['T1'], updated: 0 });
    expect((await getIntervento('T1'))?.titolo).toBe('Uno');

    const forced = await upsertInterventiFromUpload([makeIf({ numero_if: 'T1', titolo: 'Dal file' })], true);
    expect(forced).toMatchObject({ updated: 1, skipped: 0 });
    expect(await getIntervento('T1')).toMatchObject({ titolo: 'Dal file', edited_manually: false });
  });

  it('merges duplicate rows of the same file onto each other (one insert)', async () => {
    const res = await upsertInterventiFromUpload([
      makeIf({ numero_if: 'T9', titolo: 'Prima', importo: 1 }),
      makeIf({ numero_if: 'T9', titolo: 'Seconda', importo: 2 }),
    ]);
    expect(res).toMatchObject({ inserted: 1, updated: 0, insertedIfs: ['T9'] });
    expect(await getIntervento('T9')).toMatchObject({ titolo: 'Seconda', importo: 2 });
  });

  it('revives a soft-deleted IF on update', async () => {
    await upsertInterventiFromUpload([makeIf({ numero_if: 'T1', titolo: 'Uno' })]);
    await softDeleteIntervento('T1');
    expect(await getIntervento('T1')).toBeNull();
    const res = await upsertInterventiFromUpload([makeIf({ numero_if: 'T1', titolo: 'Torna' })]);
    expect(res.updated).toBe(1);
    expect(await getIntervento('T1')).toMatchObject({ titolo: 'Torna' });
  });

  it('handles more rows than one insert chunk and more updates than one parallel round', async () => {
    const many = Array.from({ length: 250 }, (_, i) => makeIf({ numero_if: `T${1000 + i}`, titolo: `IF ${i}`, importo: i }));
    const first = await upsertInterventiFromUpload(many);
    expect(first.inserted).toBe(250);
    const second = await upsertInterventiFromUpload(many.map((x) => ({ ...x, importo: x.importo + 1 })));
    expect(second).toMatchObject({ inserted: 0, updated: 250 });
    const all = await listInterventiBase();
    expect(all.filter((x) => x.numero_if.startsWith('T1')).length).toBe(250);
    expect((await getIntervento('T1249'))?.importo).toBe(250);
  });

  it('an empty upload is a no-op', async () => {
    expect(await upsertInterventiFromUpload([])).toEqual({ inserted: 0, updated: 0, skipped: 0, insertedIfs: [], updatedIfs: [], skippedIfs: [] });
  });
});
