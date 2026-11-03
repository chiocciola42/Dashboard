import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { SCHEMA_VERSION, applySchema, isMissingRelationError, readSchemaVersion, type SchemaDb } from '@/lib/db';
import { createTestDb } from './helpers/pglite';

const failing = (err: unknown): SchemaDb => ({ execute: () => Promise.reject(err) });
const returning = (result: unknown): SchemaDb => ({ execute: async () => result });

describe('isMissingRelationError', () => {
  it('recognises the Postgres undefined_table code and message', () => {
    expect(isMissingRelationError({ code: '42P01' })).toBe(true);
    expect(isMissingRelationError(new Error('relation "app_config" does not exist'))).toBe(true);
  });

  it('looks through wrapped causes, up to a bounded depth', () => {
    expect(isMissingRelationError({ message: 'Failed query', cause: { code: '42P01' } })).toBe(true);
    const deep = { cause: { cause: { cause: { cause: { cause: { code: '42P01' } } } } } };
    expect(isMissingRelationError(deep)).toBe(false);
  });

  it('does not match other failures or non-errors', () => {
    expect(isMissingRelationError(new Error('connection reset'))).toBe(false);
    expect(isMissingRelationError({ code: '28P01' })).toBe(false);
    expect(isMissingRelationError(null)).toBe(false);
    expect(isMissingRelationError('relation')).toBe(false);
  });

  it('terminates on a self-referencing cause', () => {
    const e: { cause?: unknown } = {};
    e.cause = e;
    expect(isMissingRelationError(e)).toBe(false);
  });
});

describe('readSchemaVersion', () => {
  it('REGRESSION: a missing app_config table means "fresh database" (null)', async () => {
    expect(await readSchemaVersion(failing({ code: '42P01', message: 'relation "app_config" does not exist' }))).toBeNull();
  });

  it('REGRESSION: any other error propagates instead of being read as a fresh database', async () => {
    const boom = new Error('fetch failed');
    await expect(readSchemaVersion(failing(boom))).rejects.toBe(boom);
  });

  it('reads the version from either result shape', async () => {
    expect(await readSchemaVersion(returning({ rows: [{ value: 7 }] }))).toBe(7);
    expect(await readSchemaVersion(returning([{ value: '9' }]))).toBe(9);
  });

  it('null for an empty result, a null value or a non-numeric value', async () => {
    expect(await readSchemaVersion(returning({ rows: [] }))).toBeNull();
    expect(await readSchemaVersion(returning({ rows: [{ value: null }] }))).toBeNull();
    expect(await readSchemaVersion(returning({ rows: [{ value: 'x' }] }))).toBeNull();
  });
});

describe('readSchemaVersion on a real Postgres', () => {
  let pg: PGlite;
  let db: SchemaDb;
  beforeAll(async () => {
    const t = await createTestDb();
    pg = t.pg;
    db = t.db as unknown as SchemaDb;
  });
  afterAll(async () => {
    await pg.close();
  });

  it('a brand-new database (no app_config yet) reads as null, not as an error', async () => {
    expect(await readSchemaVersion(db)).toBeNull();
  });

  it('after applySchema it reads back the current SCHEMA_VERSION', async () => {
    await applySchema(db);
    expect(await readSchemaVersion(db)).toBe(SCHEMA_VERSION);
  });
});
