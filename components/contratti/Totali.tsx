import { EUR0 } from '@/lib/format';
import type { Totali } from '@/lib/domain/contratti';

export const COLONNE: [keyof Totali, string][] = [
  ['valore', 'Valore BdO'],
  ['avanzato', 'Avanzato'],
  ['bef', 'Attestato BEF'],
  ['fatturato', 'Fatturato'],
  ['incassato', 'Incassato'],
  ['residuo', 'Residuo'],
];

export function TotaliCells({ t }: { t: Totali }) {
  return (
    <>
      {COLONNE.map(([k]) => (
        <td key={k} style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
          € {EUR0(t[k])}
        </td>
      ))}
    </>
  );
}

export function TotaliHead({ first }: { first: string }) {
  return (
    <tr>
      <th>{first}</th>
      {COLONNE.map(([k, l]) => (
        <th key={k} style={{ textAlign: 'right' }}>{l}</th>
      ))}
    </tr>
  );
}
