import Link from 'next/link';
import ContractSwitcher, { type ContrattoOpt } from './ContractSwitcher';
import LogoutButton from '../LogoutButton';

// Intestazione comune delle viste per contratto, con il selettore di contratto.
export default function ContrattiShell({
  contratti,
  currentId,
  titolo,
  children,
}: {
  contratti: ContrattoOpt[];
  currentId: number | null;
  titolo: string;
  children: React.ReactNode;
}) {
  return (
    <main className="wrap">
      <header className="brandrow">
        <div>
          <div className="eyebrow">Contratti · Fornitori · BdO/IF</div>
          <h1>{titolo}</h1>
        </div>
        <div className="hdr-right">
          <ContractSwitcher contratti={contratti} currentId={currentId} />
          <Link className="hdr-link" href="/upload">Carica dati</Link>
          <LogoutButton className="hdr-link" label="Esci" />
        </div>
      </header>
      {children}
    </main>
  );
}
