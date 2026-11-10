-- Costi contrattuali per linea di fornitura dal foglio "Oggetto Fornitura" dell'Aggregatore
-- (lib/fornituraStore.ts): milestone, canone o prestazione a misura di un IF.
-- Mirror di DDL in lib/db.ts (SCHEMA_VERSION 12).
CREATE TABLE IF NOT EXISTS "fornitura_righe" (
	"id" serial PRIMARY KEY NOT NULL,
	"numero_if" text NOT NULL,
	"num_linea" text,
	"modalita" text,
	"codice" text,
	"descrizione" text,
	"quantita" numeric(14, 4),
	"costo_unitario" numeric(18, 6),
	"costo_complessivo" numeric(18, 4),
	"fornitore" text,
	CONSTRAINT "fornitura_righe_modalita_check" CHECK ("modalita" IS NULL OR "modalita" IN ('corpo', 'canone', 'consumo'))
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fornitura_righe_numero_if_idx" ON "fornitura_righe" USING btree ("numero_if");
