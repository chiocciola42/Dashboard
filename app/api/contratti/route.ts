import { NextResponse } from 'next/server';
import { getSessionUser, canView } from '@/lib/auth';
import { getDb, hasDB, ensureSchema } from '@/lib/db';
import { listContratti } from '@/lib/domain/contratti';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  if (!canView(await getSessionUser())) {
    return NextResponse.json({ ok: false, error: 'Non autorizzato' }, { status: 403 });
  }
  if (!hasDB) return NextResponse.json({ ok: true, contratti: [], db: false });
  await ensureSchema();
  return NextResponse.json({ ok: true, contratti: await listContratti(getDb()), db: true });
}
