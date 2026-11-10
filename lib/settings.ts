// Generic, DB-backed key/value settings with an in-memory fallback.
//
// Mirrors the dual-mode pattern used by lib/store.ts: when a Neon connection
// string is configured the values are persisted in the `app_config` table
// (one JSON row per key); otherwise they live in a per-instance global seeded
// from lib/seed.ts so the app still works with zero configuration.
import { sql } from 'drizzle-orm';
import { getDb, hasDB, ensureSchema } from './db';

const g = globalThis as unknown as { __ARIA_CFG__?: Record<string, unknown> };
function memStore(): Record<string, unknown> {
  if (!g.__ARIA_CFG__) g.__ARIA_CFG__ = {};
  return g.__ARIA_CFG__;
}

// Deep clone so callers can't mutate the cached/seed object in place.
function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export async function getSetting<T>(key: string, seed: T): Promise<T> {
  const mem = memStore();
  if (hasDB) {
    try {
      await ensureSchema();
      const rows = (await getDb().execute(
        sql`select value from app_config where key = ${key} limit 1`,
      )) as unknown as { rows?: { value: unknown }[] } | { value: unknown }[];
      const list = Array.isArray(rows) ? rows : rows.rows ?? [];
      if (list.length && list[0].value != null) {
        const val = list[0].value as T;
        mem[key] = val;
        return clone(val);
      }
    } catch {
      // fall through to in-memory / seed
    }
  }
  if (key in mem) return clone(mem[key] as T);
  mem[key] = clone(seed);
  return clone(seed);
}

// Batched variant of getSetting: fetches every requested key in a single
// round-trip (relevant with the neon-http driver, where each query is an HTTP
// request). Same per-key semantics as getSetting: DB value wins, then the
// in-memory cache, then the provided seed.
export async function getSettingsBulk(seeds: Record<string, unknown>): Promise<Record<string, unknown>> {
  const keys = Object.keys(seeds);
  const mem = memStore();
  const found: Record<string, unknown> = {};
  if (hasDB && keys.length) {
    try {
      await ensureSchema();
      const inList = sql.join(keys.map((k) => sql`${k}`), sql`, `);
      const rows = (await getDb().execute(
        sql`select key, value from app_config where key in (${inList})`,
      )) as unknown as { rows?: { key: string; value: unknown }[] } | { key: string; value: unknown }[];
      const list = Array.isArray(rows) ? rows : rows.rows ?? [];
      for (const r of list) {
        if (r.value != null) {
          mem[r.key] = r.value;
          found[r.key] = clone(r.value);
        }
      }
    } catch {
      // fall through to in-memory / seed for every key
    }
  }
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (key in found) out[key] = found[key];
    else if (key in mem) out[key] = clone(mem[key]);
    else {
      mem[key] = clone(seeds[key]);
      out[key] = clone(seeds[key]);
    }
  }
  return out;
}

// Come `getSetting`, ma un errore del database si PROPAGA invece di ripiegare su cache o seed.
// Serve prima di una scrittura che parte dal valore letto (leggi, modifica, riscrivi): con il
// ripiego silenzioso un guasto momentaneo farebbe ripartire dal seed e la riscrittura cancellerebbe
// dati inseriti a mano. Una chiave assente (lettura riuscita, nessuna riga) vale il seed.
export async function getSettingStrict<T>(key: string, seed: T): Promise<T> {
  const mem = memStore();
  if (hasDB) {
    await ensureSchema();
    const rows = (await getDb().execute(
      sql`select value from app_config where key = ${key} limit 1`,
    )) as unknown as { rows?: { value: unknown }[] } | { value: unknown }[];
    const list = Array.isArray(rows) ? rows : rows.rows ?? [];
    if (list.length && list[0].value != null) {
      mem[key] = list[0].value;
      return clone(list[0].value as T);
    }
    return clone(seed);
  }
  if (key in mem) return clone(mem[key] as T);
  mem[key] = clone(seed);
  return clone(seed);
}

// Come `setSetting`, ma se la scrittura sul database fallisce l'errore si propaga: chi chiama non
// riceve un "ok" per un valore che non è stato salvato, e la cache in memoria non resta diversa
// dal database.
export async function setSettingStrict<T>(key: string, value: T): Promise<T> {
  if (hasDB) {
    await ensureSchema();
    const json = JSON.stringify(value);
    await getDb().execute(
      sql`insert into app_config (key, value, updated_at)
          values (${key}, ${json}::jsonb, now())
          on conflict (key) do update set value = ${json}::jsonb, updated_at = now()`,
    );
  }
  memStore()[key] = clone(value);
  return clone(value);
}

export async function setSetting<T>(key: string, value: T): Promise<T> {
  const mem = memStore();
  mem[key] = clone(value);
  if (hasDB) {
    try {
      await ensureSchema();
      const json = JSON.stringify(value);
      await getDb().execute(
        sql`insert into app_config (key, value, updated_at)
            values (${key}, ${json}::jsonb, now())
            on conflict (key) do update set value = ${json}::jsonb, updated_at = now()`,
      );
    } catch {
      // keep the in-memory value even if persistence fails
    }
  }
  return clone(value);
}
