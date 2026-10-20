import { describe, expect, it, beforeAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { applySchema } from '@/lib/db';
import { createTestDb } from './helpers/pglite';

describe('schema v2: Contratto → Fornitore → BdO/IF', () => {
  let db: Awaited<ReturnType<typeof createTestDb>>['db'];
  beforeAll(async () => {
    ({ db } = await createTestDb());
    await applySchema(db as never);
    await applySchema(db as never); // idempotente
    await db.execute(sql`insert into buoni_ordine (numero_bdo) values ('B1'),('B2')`);
    await db.execute(sql`insert into interventi_fornitura (numero_if) values ('I1'),('I2')`);
    await db.execute(sql`insert into associazioni_bdo_if (bdo_id, if_id) select b.id, i.id from buoni_ordine b, interventi_fornitura i where b.numero_bdo='B1' and i.numero_if='I1'`);
  });

  it('rifiuta numero_bdo e numero_if duplicati', async () => {
    await expect(db.execute(sql`insert into buoni_ordine (numero_bdo) values ('B1')`)).rejects.toThrow();
    await expect(db.execute(sql`insert into interventi_fornitura (numero_if) values ('I1')`)).rejects.toThrow();
  });

  it('impone l’associazione 1:1 in entrambe le direzioni', async () => {
    await expect(
      db.execute(sql`insert into associazioni_bdo_if (bdo_id, if_id) select b.id, i.id from buoni_ordine b, interventi_fornitura i where b.numero_bdo='B1' and i.numero_if='I2'`),
    ).rejects.toThrow();
    await expect(
      db.execute(sql`insert into associazioni_bdo_if (bdo_id, if_id) select b.id, i.id from buoni_ordine b, interventi_fornitura i where b.numero_bdo='B2' and i.numero_if='I1'`),
    ).rejects.toThrow();
    await db.execute(sql`insert into associazioni_bdo_if (bdo_id, if_id, origine_associazione) select b.id, i.id, 'Manuale' from buoni_ordine b, interventi_fornitura i where b.numero_bdo='B2' and i.numero_if='I2'`);
  });

  it('valida stato BdO e ruolo fornitore', async () => {
    await expect(db.execute(sql`insert into buoni_ordine (numero_bdo, stato) values ('B3','x')`)).rejects.toThrow();
    await db.execute(sql`insert into contratti (codice) values ('C1')`);
    await db.execute(sql`insert into fornitori (nome) values ('F1')`);
    await expect(
      db.execute(sql`insert into contratti_fornitori (contratto_id, fornitore_id, ruolo) select c.id, f.id, 'Boh' from contratti c, fornitori f`),
    ).rejects.toThrow();
  });
});
