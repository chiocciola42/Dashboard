'use client';
import React from 'react';
import type { Intervento, InterventoInput } from '@/lib/types';
import type { MonthlyState } from '@/lib/dettaglioIF';
import IfCard from './IfCard';

// Card view of the IFs.
export default function IfCardsView({
  rows,
  canEdit,
  savingIds,
  highlightIds,
  monthly,
  onToggleMonthly,
  onSaveField,
  onOpenEdit,
  onDelete,
}: {
  rows: Intervento[];
  canEdit: boolean;
  savingIds: Set<string>;
  highlightIds: Set<string>;
  monthly: Record<string, MonthlyState>;
  onToggleMonthly: (numero_if: string) => void;
  onSaveField: (numero_if: string, patch: InterventoInput) => void;
  onOpenEdit: (i: Intervento) => void;
  onDelete: (numero_if: string) => void;
}) {
  return (
    <div className="difcards">
      {rows.map((x) => (
        <IfCard
          key={x.numero_if}
          x={x}
          canEdit={canEdit}
          saving={savingIds.has(x.numero_if)}
          hl={highlightIds.has(x.numero_if)}
          monthlyState={monthly[x.numero_if] || 'loading'}
          onToggleMonthly={onToggleMonthly}
          onSaveField={onSaveField}
          onOpenEdit={onOpenEdit}
          onDelete={onDelete}
        />
      ))}
      {rows.length === 0 && <div className="empty">Nessun IF in questa vista.</div>}
    </div>
  );
}
