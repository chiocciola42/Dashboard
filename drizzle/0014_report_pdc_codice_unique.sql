-- Più PDC (codice_pdc diversi) possono riferirsi alla stessa posizione BDO e allo
-- stesso periodo: la chiave a tre campi (num_bdo, posizione_bdo, periodo_pdc)
-- le faceva collidere e l'import dell'intero report falliva con
-- "ON CONFLICT DO UPDATE command cannot affect row a second time".
-- Mirror di lib/db.ts (SCHEMA_VERSION 10).
DROP INDEX IF EXISTS "report_pdc_num_bdo_posizione_periodo_unique";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "report_pdc_num_bdo_posizione_periodo_codice_unique" ON "report_pdc" USING btree ("num_bdo","posizione_bdo","periodo_pdc","codice_pdc");
