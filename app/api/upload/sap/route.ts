import { NextResponse } from 'next/server';
import { getSessionUser, canEdit } from '@/lib/auth';
import { isUploadAuthorized } from '@/lib/auth/uploadSecret';
import { getDb, hasDB, ensureSchema } from '@/lib/db';
import { importIf, importSapRows } from '@/lib/importer';
import { sanitizeRows, SAP_KINDS, type UploadKind } from '@/lib/sapPayload';
import { importazioni_sap } from '@/lib/schema';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Upload dei report SAP nel modello Contratto → Fornitore → BdO/IF.
// Il browser legge l'Excel e invia le righe a blocchi; un blocco contiene sempre
// tutte le righe dei suoi BdO (l'import rimpiazza per BdO). `part`/`parts`
// numerano i blocchi di uno stesso file: l'esito si registra all'ultimo.
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!canEdit(user)) {
    return NextResponse.json({ ok: false, error: 'Permessi di modifica non concessi' }, { status: 403 });
  }
  if (!isUploadAuthorized(req.headers)) {
    return NextResponse.json({ ok: false, error: 'Non autorizzato' }, { status: 401 });
  }
  if (!hasDB) {
    return NextResponse.json({ ok: false, error: 'Database non configurato (DATABASE_URL)' }, { status: 503 });
  }
  let body: { kind?: string; rows?: unknown; filename?: string; part?: number; parts?: number; total?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'JSON non valido' }, { status: 400 });
  }
  const kind = body.kind as UploadKind;
  if (!SAP_KINDS.includes(kind)) {
    return NextResponse.json({ ok: false, error: 'Tipo file non supportato' }, { status: 422 });
  }
  const checked = sanitizeRows(kind, body.rows);
  if (!checked.ok) return NextResponse.json({ ok: false, error: checked.error }, { status: 400 });

  await ensureSchema();
  const db = getDb() as never;
  const nome = (typeof body.filename === 'string' ? body.filename : 'upload').slice(0, 200);
  const last = !body.parts || (body.part ?? 1) >= body.parts;
  try {
    const summary = 'ifRows' in checked ? await importIf(db, checked.ifRows) : await importSapRows(db, checked.parsed);
    if (last) {
      await getDb().insert(importazioni_sap).values({
        nome_file: nome, tipo: kind, righe_lette: Number.isFinite(body.total) ? Number(body.total) : summary.righe_lette,
        utente: user?.email ?? null,
      });
    }
    return NextResponse.json({ ok: true, ...summary });
  } catch (e) {
    await getDb().insert(importazioni_sap).values({
      nome_file: nome, tipo: kind, esito: 'errore', messaggio: e instanceof Error ? e.message.slice(0, 500) : 'errore', utente: user?.email ?? null,
    });
    return NextResponse.json({ ok: false, error: 'Importazione non riuscita' }, { status: 500 });
  }
}
