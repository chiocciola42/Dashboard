'use client';
import React from 'react';
import Link from 'next/link';

// Shown when the portfolio has no IF/BO at all.
export default function EmptyPortfolio({ canEdit }: { canEdit: boolean }) {
  return (
      <div className="emptystate" role="status">
        <div className="emptystate-ic" aria-hidden>📂</div>
        <h2>Nessun dato nel portafoglio</h2>
        <p>
          Non ci sono ancora IF/BO da mostrare. {canEdit
            ? 'Carica un file Excel (Dashboard ARIA SISS, Aggregatore o IF_ARIA) per popolare la dashboard.'
            : 'Chiedi a un utente abilitato di caricare i dati di portafoglio.'}
        </p>
        {canEdit && (
          <Link href="/upload" className="addbtn">
            ⤴ Carica dati
          </Link>
        )}
      </div>
  );
}
