import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSettingStrict, setSettingStrict } from '@/lib/settings';

// Un database che risponde, o che fallisce, a comando.
const db = vi.hoisted(() => ({
  has: true,
  execute: vi.fn(),
}));
vi.mock('@/lib/db', () => ({
  get hasDB() {
    return db.has;
  },
  getDb: () => ({ execute: db.execute }),
  ensureSchema: async () => {},
}));

beforeEach(() => {
  db.has = true;
  db.execute.mockReset();
  delete (globalThis as Record<string, unknown>).__ARIA_CFG__;
});

describe('getSettingStrict', () => {
  it('returns the stored value', async () => {
    db.execute.mockResolvedValue({ rows: [{ value: [{ figura: 'PM', tariffa: 640 }] }] });
    expect(await getSettingStrict('seniority', [])).toEqual([{ figura: 'PM', tariffa: 640 }]);
  });

  it('a key that is simply absent (query ok, no row) gives the seed', async () => {
    db.execute.mockResolvedValue({ rows: [] });
    expect(await getSettingStrict('seniority', ['seed'])).toEqual(['seed']);
  });

  it('REGRESSION: a database failure is propagated, never turned into the seed', async () => {
    db.execute.mockRejectedValue(new Error('connection reset'));
    await expect(getSettingStrict('seniority', ['seed'])).rejects.toThrow('connection reset');
  });

  it('without a database it uses the in-memory value, then the seed', async () => {
    db.has = false;
    expect(await getSettingStrict('k', { n: 1 })).toEqual({ n: 1 });
    await setSettingStrict('k', { n: 2 });
    expect(await getSettingStrict('k', { n: 1 })).toEqual({ n: 2 });
  });
});

describe('setSettingStrict', () => {
  it('writes to the database and keeps the memory copy in step', async () => {
    db.execute.mockResolvedValue({ rows: [] });
    await setSettingStrict('k', { n: 3 });
    expect(db.execute).toHaveBeenCalledTimes(1);
    db.has = false;
    expect(await getSettingStrict('k', null)).toEqual({ n: 3 });
  });

  it('REGRESSION: a failed write is reported, and memory is not left different from the database', async () => {
    db.execute.mockRejectedValue(new Error('timeout'));
    await expect(setSettingStrict('k', { n: 9 })).rejects.toThrow('timeout');
    db.has = false;
    expect(await getSettingStrict('k', { n: 0 })).toEqual({ n: 0 });
  });
});
