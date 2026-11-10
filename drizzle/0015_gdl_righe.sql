-- Giornate reali per IF dal foglio "GdL - Gruppo di Lavoro" dell'Aggregatore (lib/gdlStore.ts):
-- una riga per attività, figura professionale e risorsa. Righe identiche di una stessa figura
-- sono persone diverse, quindi non c'è alcuna chiave unica.
-- Mirror di DDL in lib/db.ts (SCHEMA_VERSION 11).
CREATE TABLE IF NOT EXISTS "gdl_righe" (
	"id" serial PRIMARY KEY NOT NULL,
	"numero_if" text NOT NULL,
	"codice" text,
	"tipo" text,
	"descrizione" text,
	"figura" text,
	"nome_risorsa" text,
	"gg" numeric(10, 4),
	"azienda" text,
	CONSTRAINT "gdl_righe_tipo_check" CHECK ("tipo" IS NULL OR "tipo" IN ('corpo', 'canone', 'consumo'))
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gdl_righe_numero_if_idx" ON "gdl_righe" USING btree ("numero_if");
