// Aggregazione dell'imbuto "Stato IF/BO": ogni passo è un sottoinsieme del precedente,
// così la perdita fra due passi è sempre >= 0 e leggibile come "IF bloccati".
import type { Intervento } from './types';

export type FunnelStat = { n: number; v: number };

const add = (acc: FunnelStat, i: Intervento): FunnelStat => ({ n: acc.n + 1, v: acc.v + (i.importo || 0) });
const stat = (IFs: readonly Intervento[]): FunnelStat => IFs.reduce(add, { n: 0, v: 0 });

// [IF totali, approvati, approvati con BO, approvati con BO e attivati]
export function funnelStats(IFs: readonly Intervento[]): [FunnelStat, FunnelStat, FunnelStat, FunnelStat] {
  const approvati = IFs.filter((i) => i.stato === 'approvato');
  const conBo = approvati.filter((i) => i.has_bo);
  const attivati = conBo.filter((i) => i.attivazione === 'SI');
  return [stat(IFs), stat(approvati), stat(conBo), stat(attivati)];
}
