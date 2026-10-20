import { redirect } from 'next/navigation';
import Link from 'next/link';
import { cookies } from 'next/headers';
import AccessGate from '@/components/AccessGate';
import ContrattiShell from '@/components/contratti/ContrattiShell';
import { TotaliCells, TotaliHead } from '@/components/contratti/Totali';
import { getSessionUser, canView } from '@/lib/auth';
import { getDb, hasDB, ensureSchema } from '@/lib/db';
import { listContratti } from '@/lib/domain/contratti';

export const dynamic = 'force-dynamic';

// Livello 1: elenco contratti. ?tutti=1 salta il ritorno all'ultimo contratto aperto.
export default async function ContrattiPage({ searchParams }: { searchParams?: { tutti?: string } }) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (!canView(user)) return <AccessGate user={user} />;

  if (!hasDB) {
    return (
      <ContrattiShell contratti={[]} currentId={null} titolo="Contratti">
        <div className="emptystate">Il modello per contratto richiede un database (DATABASE_URL).</div>
      </ContrattiShell>
    );
  }
  await ensureSchema();
  const contratti = await listContratti(getDb());

  const last = Number(cookies().get('contratto_attivo')?.value);
  if (!searchParams?.tutti && last && contratti.some((c) => c.id === last)) redirect(`/contratti/${last}`);

  return (
    <ContrattiShell contratti={contratti} currentId={null} titolo="Tutti i contratti">
      {contratti.length === 0 ? (
        <div className="emptystate">Nessun contratto: carica i report SAP (PDC, BEF) da «Carica dati».</div>
      ) : (
        <div className="card">
          <table className="dtable">
            <thead><TotaliHead first="Contratto" /></thead>
            <tbody>
              {contratti.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/contratti/${c.id}`}>{c.codice}</Link>{' '}
                    <span className="fdd-optcount">{c.n_bdo} BdO{c.n_da_riconciliare ? ` · ${c.n_da_riconciliare} da riconciliare` : ''}</span>
                  </td>
                  <TotaliCells t={c} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ContrattiShell>
  );
}
