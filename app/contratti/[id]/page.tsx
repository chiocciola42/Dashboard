import { redirect, notFound } from 'next/navigation';
import AccessGate from '@/components/AccessGate';
import ContrattiShell from '@/components/contratti/ContrattiShell';
import { TotaliCells, TotaliHead } from '@/components/contratti/Totali';
import { getSessionUser, canView } from '@/lib/auth';
import { getDb, hasDB, ensureSchema } from '@/lib/db';
import { getContratto, listContratti, type Totali } from '@/lib/domain/contratti';

export const dynamic = 'force-dynamic';

// Livello 2: dettaglio del contratto selezionato con ripartizione per fornitore.
export default async function ContrattoPage({ params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (!canView(user)) return <AccessGate user={user} />;
  const id = Number(params.id);
  if (!hasDB || !Number.isInteger(id)) notFound();
  await ensureSchema();
  const db = getDb();
  const [det, contratti] = await Promise.all([getContratto(db, id), listContratti(db)]);
  if (!det) notFound();

  const sum = (k: keyof Totali) => det.fornitori.reduce((a, f) => a + f[k], 0);
  const tot: Totali = {
    valore: sum('valore'), avanzato: sum('avanzato'), bef: sum('bef'),
    fatturato: sum('fatturato'), incassato: sum('incassato'), residuo: sum('residuo'),
  };

  return (
    <ContrattiShell contratti={contratti} currentId={id} titolo={det.contratto.codice}>
      <div className="card">
        <table className="dtable">
          <thead><TotaliHead first="Fornitore" /></thead>
          <tbody>
            {det.fornitori.map((f) => (
              <tr key={f.id ?? 'na'}>
                <td>{f.nome}</td>
                <TotaliCells t={f} />
              </tr>
            ))}
            <tr style={{ fontWeight: 800 }}>
              <td>Totale contratto</td>
              <TotaliCells t={tot} />
            </tr>
          </tbody>
        </table>
      </div>
    </ContrattiShell>
  );
}
