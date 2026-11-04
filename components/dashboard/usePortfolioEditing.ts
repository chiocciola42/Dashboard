'use client';
import { useCallback, useEffect, useState } from 'react';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import type { DashboardData, Intervento, InterventoInput, RtiConfig } from '@/lib/types';
import {
  patchIntervento,
  prependIntervento,
  quotaValFromRti,
  removeIntervento,
  replaceIntervento,
  withId,
} from '@/lib/dashboardView';

export type RtiUpdate = { massimale_totale: number; quota_intellera_pct: number; quota_deloitte_pct: number };
type ShowToast = (msg: string, bad?: boolean, ms?: number) => void;

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const SESSION_EXPIRED_MS = 4000;
const HIGHLIGHT_MS = 1300;

// Owns the server-derived state of the dashboard (portfolio, RTI config, quotas)
// and the optimistic editing handlers that mutate it: every handler applies the
// change locally first and rolls back when the server refuses or is unreachable.
export function usePortfolioEditing({
  initial,
  anno,
  showToast,
}: {
  initial: DashboardData;
  anno: number;
  showToast: ShowToast;
}) {
  const [interventi, setInterventi] = useState<Intervento[]>(initial.interventi);
  const [rti, setRti] = useState<RtiConfig>(initial.rti);
  const [quotaVal, setQuotaVal] = useState<Record<string, number>>(initial.quota_val);
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [highlightIds, setHighlightIds] = useState<Set<string>>(new Set());

  // SSR re-runs (e.g. after an upload + router.refresh()) deliver fresh data via
  // the `initial` prop. useState ignores prop changes after mount, so sync the
  // server-derived state whenever a new payload arrives, otherwise the view
  // keeps showing the data captured at first mount.
  useEffect(() => {
    setInterventi(initial.interventi);
    setRti(initial.rti);
    setQuotaVal(initial.quota_val);
  }, [initial]);

  // A 401/403 during an optimistic mutation means the session expired: give a
  // clear "log in again" message instead of a generic failure, and return true
  // so the caller can skip its own generic toast.
  const handledAuthError = useCallback(
    (status: number | undefined): boolean => {
      if (status !== 401 && status !== 403) return false;
      showToast('Sessione scaduta: effettua di nuovo il login', true, SESSION_EXPIRED_MS);
      return true;
    },
    [showToast],
  );

  const flashRow = useCallback((id: string) => {
    setHighlightIds((s) => withId(s, id, true));
    setTimeout(() => setHighlightIds((s) => withId(s, id, false)), HIGHLIGHT_MS);
  }, []);

  const setSaving = useCallback((id: string, on: boolean) => setSavingIds((s) => withId(s, id, on)), []);

  const onSaveField = useCallback(
    async (numero_if: string, patch: InterventoInput) => {
      const prev = interventi;
      setInterventi((list) => patchIntervento(list, numero_if, patch));
      setSaving(numero_if, true);
      try {
        const res = await fetchWithTimeout(`/api/interventi/${encodeURIComponent(numero_if)}`, {
          method: 'PUT',
          headers: JSON_HEADERS,
          body: JSON.stringify({ ...patch, anno }),
        });
        if (!res.ok) {
          setInterventi(prev);
          if (!handledAuthError(res.status)) showToast('Salvataggio non riuscito', true);
          return;
        }
        const data = await res.json();
        setInterventi((list) => replaceIntervento(list, numero_if, data.updated as Intervento));
        flashRow(numero_if);
      } catch {
        setInterventi(prev);
        showToast('Salvataggio non riuscito', true);
      } finally {
        setSaving(numero_if, false);
      }
    },
    [interventi, flashRow, setSaving, showToast, handledAuthError, anno],
  );

  const createIntervento = useCallback(
    async (input: InterventoInput): Promise<boolean> => {
      const res = await fetchWithTimeout('/api/interventi', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ ...input, anno }),
      });
      if (!res.ok) {
        if (handledAuthError(res.status)) return false;
        const e = await res.json().catch(() => ({}));
        showToast(e.error || 'Creazione non riuscita', true);
        return false;
      }
      const data = await res.json();
      const created = data.created as Intervento;
      setInterventi((list) => prependIntervento(list, created));
      flashRow(created.numero_if);
      showToast('Intervento creato');
      return true;
    },
    [anno, flashRow, showToast, handledAuthError],
  );

  const updateIntervento = useCallback(
    async (input: InterventoInput): Promise<boolean> => {
      const id = input.numero_if as string;
      const res = await fetchWithTimeout(`/api/interventi/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: JSON_HEADERS,
        body: JSON.stringify({ ...input, anno }),
      });
      if (!res.ok) {
        if (!handledAuthError(res.status)) showToast('Salvataggio non riuscito', true);
        return false;
      }
      const data = await res.json();
      setInterventi((list) => replaceIntervento(list, id, data.updated as Intervento));
      flashRow(id);
      showToast('Modifiche salvate');
      return true;
    },
    [anno, flashRow, showToast, handledAuthError],
  );

  const onSaveDrawer = useCallback(
    async (input: InterventoInput, isNew: boolean): Promise<boolean> => {
      try {
        return isNew ? await createIntervento(input) : await updateIntervento(input);
      } catch {
        showToast('Errore di rete', true);
        return false;
      }
    },
    [createIntervento, updateIntervento, showToast],
  );

  const onDelete = useCallback(
    async (numero_if: string) => {
      const prev = interventi;
      setInterventi((list) => removeIntervento(list, numero_if));
      try {
        const res = await fetchWithTimeout(`/api/interventi/${encodeURIComponent(numero_if)}`, { method: 'DELETE' });
        if (!res.ok) {
          setInterventi(prev);
          if (!handledAuthError(res.status)) showToast('Eliminazione non riuscita', true);
          return;
        }
        showToast(`IF ${numero_if} eliminato`);
      } catch {
        setInterventi(prev);
        showToast('Eliminazione non riuscita', true);
      }
    },
    [interventi, showToast, handledAuthError],
  );

  const onUpdateRti = useCallback(
    async (u: RtiUpdate) => {
      try {
        const res = await fetchWithTimeout('/api/config/rti', {
          method: 'PUT',
          headers: JSON_HEADERS,
          body: JSON.stringify(u),
        });
        if (!res.ok) throw new Error();
        const data = await res.json();
        const updated = data.rti as RtiConfig;
        setRti((cur) => ({ ...cur, ...updated }));
        setQuotaVal((cur) => quotaValFromRti(cur, updated));
        showToast('Parametri RTI aggiornati');
      } catch {
        showToast('Aggiornamento RTI non riuscito', true);
      }
    },
    [showToast],
  );

  return { interventi, rti, quotaVal, savingIds, highlightIds, onSaveField, onSaveDrawer, onDelete, onUpdateRti };
}
