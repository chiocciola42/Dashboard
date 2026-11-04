'use client';
import { useState } from 'react';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import type { MonthlyState } from '@/lib/dettaglioIF';

// On-demand monthly detail (PDC / SAL / BEF) of the expanded rows/cards. The
// first expansion of an IF fetches it once; later toggles reuse the result.
export function useMonthlyDetail() {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [monthly, setMonthly] = useState<Record<string, MonthlyState>>({});

  const toggleMonthly = (numero_if: string) => {
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(numero_if)) n.delete(numero_if);
      else n.add(numero_if);
      return n;
    });
    if (monthly[numero_if]) return;
    setMonthly((m) => ({ ...m, [numero_if]: 'loading' }));
    fetchWithTimeout(`/api/interventi/${encodeURIComponent(numero_if)}/monthly`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => setMonthly((m) => ({ ...m, [numero_if]: { pdc: data.pdc, sal: data.sal, bef: data.bef } })))
      .catch(() => setMonthly((m) => ({ ...m, [numero_if]: 'error' })));
  };

  return { expanded, monthly, toggleMonthly };
}
