// Allineamento del portafoglio a un file Aggregatore: l'Aggregatore ricalcola ogni volta l'elenco
// completo degli IF, quindi un IF presente nell'app ma assente dal file non fa più parte del
// contratto aggregato e gonfia i totali (es. un IF del portafoglio di base mai rientrato nei file).
// Modulo puro: nessun accesso a DB, rete o orologio.
import type { Intervento } from './types';

export const MAX_IF_SINCRONIZZAZIONE = 5_000;

export type IfAssenti = {
  // IF assenti dal file che la sincronizzazione può archiviare.
  archiviabili: string[];
  // IF assenti dal file modificati a mano: restano, salvo `force`.
  preservati: string[];
};

// IF attivi nell'app che il file non contiene. Un IF modificato a mano è protetto come negli
// altri upload (si archivia solo con `force`).
export function ifAssenti(
  attivi: readonly Pick<Intervento, 'numero_if' | 'edited_manually'>[],
  nelFile: ReadonlySet<string>,
  force: boolean,
): IfAssenti {
  if (attivi.length > MAX_IF_SINCRONIZZAZIONE) {
    throw new Error(`Sincronizzazione: ${attivi.length} IF, massimo ${MAX_IF_SINCRONIZZAZIONE}`);
  }
  const out: IfAssenti = { archiviabili: [], preservati: [] };
  for (const i of attivi) {
    if (nelFile.has(i.numero_if)) continue;
    (i.edited_manually && !force ? out.preservati : out.archiviabili).push(i.numero_if);
  }
  return out;
}
