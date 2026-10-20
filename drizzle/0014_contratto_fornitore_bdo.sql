CREATE TABLE IF NOT EXISTS "associazioni_bdo_if" (
	"id" serial PRIMARY KEY NOT NULL,
	"bdo_id" integer NOT NULL,
	"if_id" integer NOT NULL,
	"data_associazione" timestamp DEFAULT now() NOT NULL,
	"origine_associazione" text DEFAULT 'SAP' NOT NULL,
	CONSTRAINT "associazioni_bdo_if_bdo_id_unique" UNIQUE("bdo_id"),
	CONSTRAINT "associazioni_bdo_if_if_id_unique" UNIQUE("if_id"),
	CONSTRAINT "associazioni_bdo_if_origine_check" CHECK ("associazioni_bdo_if"."origine_associazione" in ('SAP','Manuale','Importazione'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "benestari_fatturazione" (
	"id" serial PRIMARY KEY NOT NULL,
	"bdo_id" integer NOT NULL,
	"periodo" text DEFAULT '' NOT NULL,
	"descrizione" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "buoni_ordine" (
	"id" serial PRIMARY KEY NOT NULL,
	"numero_bdo" text NOT NULL,
	"contratto_id" integer,
	"descrizione" text,
	"stato" text DEFAULT 'da_riconciliare' NOT NULL,
	"dati_sap" jsonb,
	"note" text,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "buoni_ordine_numero_bdo_unique" UNIQUE("numero_bdo"),
	CONSTRAINT "buoni_ordine_stato_check" CHECK ("buoni_ordine"."stato" in ('validato','da_riconciliare'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "clienti" (
	"id" serial PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "clienti_nome_unique" UNIQUE("nome")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contratti" (
	"id" serial PRIMARY KEY NOT NULL,
	"codice" text NOT NULL,
	"cliente_id" integer,
	"descrizione" text,
	"cig" text,
	"massimale" numeric(18, 4),
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "contratti_codice_unique" UNIQUE("codice")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contratti_fornitori" (
	"contratto_id" integer NOT NULL,
	"fornitore_id" integer NOT NULL,
	"ruolo" text DEFAULT 'Altro' NOT NULL,
	"quota_contrattuale" numeric(18, 4),
	"attivo" boolean DEFAULT true NOT NULL,
	CONSTRAINT "contratti_fornitori_pk" PRIMARY KEY("contratto_id","fornitore_id"),
	CONSTRAINT "contratti_fornitori_ruolo_check" CHECK ("contratti_fornitori"."ruolo" in ('Mandataria','Mandante','Altro'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fatture" (
	"id" serial PRIMARY KEY NOT NULL,
	"numero" text NOT NULL,
	"data_fattura" date,
	CONSTRAINT "fatture_numero_unique" UNIQUE("numero")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fornitori" (
	"id" serial PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "fornitori_nome_unique" UNIQUE("nome")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "importazioni_sap" (
	"id" serial PRIMARY KEY NOT NULL,
	"nome_file" text NOT NULL,
	"tipo" text NOT NULL,
	"hash" text,
	"esito" text DEFAULT 'ok' NOT NULL,
	"righe_lette" integer DEFAULT 0,
	"righe_scartate" integer DEFAULT 0,
	"messaggio" text,
	"utente" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "interventi_fornitura" (
	"id" serial PRIMARY KEY NOT NULL,
	"numero_if" text NOT NULL,
	"titolo" text,
	"ambito" text,
	"modalita" text,
	"azione" text,
	"note" text,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "interventi_fornitura_numero_if_unique" UNIQUE("numero_if")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pagamenti" (
	"id" serial PRIMARY KEY NOT NULL,
	"fattura_id" integer NOT NULL,
	"data_pagamento" date NOT NULL,
	"importo" numeric(15, 4)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "piani_consegna" (
	"id" serial PRIMARY KEY NOT NULL,
	"bdo_id" integer NOT NULL,
	"posizione" text NOT NULL,
	"periodo" text NOT NULL,
	"fornitore_id" integer,
	"codice_pdc" text,
	"stato" text,
	"importo" numeric(15, 4),
	"data_approvazione" date
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "posizioni_bdo" (
	"id" serial PRIMARY KEY NOT NULL,
	"bdo_id" integer NOT NULL,
	"posizione" text NOT NULL,
	"fornitore_id" integer,
	"descrizione" text,
	"importo" numeric(15, 4)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "righe_bef" (
	"id" serial PRIMARY KEY NOT NULL,
	"bef_id" integer NOT NULL,
	"posizione" text DEFAULT '' NOT NULL,
	"fornitore_id" integer,
	"importo" numeric(15, 4),
	"fattura_id" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "storico_modifiche" (
	"id" serial PRIMARY KEY NOT NULL,
	"entita" text NOT NULL,
	"entita_id" integer NOT NULL,
	"campo" text NOT NULL,
	"valore_precedente" text,
	"valore_nuovo" text,
	"utente" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "verbali" (
	"id" serial PRIMARY KEY NOT NULL,
	"bdo_id" integer NOT NULL,
	"tipo" text NOT NULL,
	"codifica" text DEFAULT '' NOT NULL,
	"periodo" text,
	"stato" text,
	"fornitore_id" integer,
	"data_firma" date,
	"dettagli" jsonb,
	CONSTRAINT "verbali_tipo_check" CHECK ("verbali"."tipo" in ('apertura','sal','chiusura'))
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "associazioni_bdo_if" ADD CONSTRAINT "associazioni_bdo_if_bdo_id_buoni_ordine_id_fk" FOREIGN KEY ("bdo_id") REFERENCES "public"."buoni_ordine"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "associazioni_bdo_if" ADD CONSTRAINT "associazioni_bdo_if_if_id_interventi_fornitura_id_fk" FOREIGN KEY ("if_id") REFERENCES "public"."interventi_fornitura"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "benestari_fatturazione" ADD CONSTRAINT "benestari_fatturazione_bdo_id_buoni_ordine_id_fk" FOREIGN KEY ("bdo_id") REFERENCES "public"."buoni_ordine"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "buoni_ordine" ADD CONSTRAINT "buoni_ordine_contratto_id_contratti_id_fk" FOREIGN KEY ("contratto_id") REFERENCES "public"."contratti"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contratti" ADD CONSTRAINT "contratti_cliente_id_clienti_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clienti"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contratti_fornitori" ADD CONSTRAINT "contratti_fornitori_contratto_id_contratti_id_fk" FOREIGN KEY ("contratto_id") REFERENCES "public"."contratti"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contratti_fornitori" ADD CONSTRAINT "contratti_fornitori_fornitore_id_fornitori_id_fk" FOREIGN KEY ("fornitore_id") REFERENCES "public"."fornitori"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pagamenti" ADD CONSTRAINT "pagamenti_fattura_id_fatture_id_fk" FOREIGN KEY ("fattura_id") REFERENCES "public"."fatture"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "piani_consegna" ADD CONSTRAINT "piani_consegna_bdo_id_buoni_ordine_id_fk" FOREIGN KEY ("bdo_id") REFERENCES "public"."buoni_ordine"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "piani_consegna" ADD CONSTRAINT "piani_consegna_fornitore_id_fornitori_id_fk" FOREIGN KEY ("fornitore_id") REFERENCES "public"."fornitori"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "posizioni_bdo" ADD CONSTRAINT "posizioni_bdo_bdo_id_buoni_ordine_id_fk" FOREIGN KEY ("bdo_id") REFERENCES "public"."buoni_ordine"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "posizioni_bdo" ADD CONSTRAINT "posizioni_bdo_fornitore_id_fornitori_id_fk" FOREIGN KEY ("fornitore_id") REFERENCES "public"."fornitori"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "righe_bef" ADD CONSTRAINT "righe_bef_bef_id_benestari_fatturazione_id_fk" FOREIGN KEY ("bef_id") REFERENCES "public"."benestari_fatturazione"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "righe_bef" ADD CONSTRAINT "righe_bef_fornitore_id_fornitori_id_fk" FOREIGN KEY ("fornitore_id") REFERENCES "public"."fornitori"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "verbali" ADD CONSTRAINT "verbali_bdo_id_buoni_ordine_id_fk" FOREIGN KEY ("bdo_id") REFERENCES "public"."buoni_ordine"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "verbali" ADD CONSTRAINT "verbali_fornitore_id_fornitori_id_fk" FOREIGN KEY ("fornitore_id") REFERENCES "public"."fornitori"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "benestari_bdo_periodo_unique" ON "benestari_fatturazione" USING btree ("bdo_id","periodo");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "buoni_ordine_contratto_idx" ON "buoni_ordine" USING btree ("contratto_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "pagamenti_fattura_data_unique" ON "pagamenti" USING btree ("fattura_id","data_pagamento");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "piani_consegna_bdo_pos_periodo_unique" ON "piani_consegna" USING btree ("bdo_id","posizione","periodo");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "posizioni_bdo_bdo_posizione_unique" ON "posizioni_bdo" USING btree ("bdo_id","posizione");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "righe_bef_bef_posizione_fattura_unique" ON "righe_bef" USING btree ("bef_id","posizione",coalesce("fattura_id", 0));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "storico_modifiche_entita_idx" ON "storico_modifiche" USING btree ("entita","entita_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "verbali_bdo_tipo_codifica_periodo_unique" ON "verbali" USING btree ("bdo_id","tipo","codifica",coalesce("periodo", ''));
