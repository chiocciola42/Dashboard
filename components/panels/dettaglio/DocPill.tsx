'use client';
import React from 'react';
import type { DocStatus } from '@/lib/types';
import { ICO } from '@/lib/format';

// Mirrors the "📋 Dettaglio IF" export: stessa sequenza di colonne, stessi
// campi. ICO fornisce colore/etichetta/glifo condivisi con il resto della app.
export default function DocPill({ v }: { v: DocStatus }) {
  const [color, label, glyph] = ICO[v];
  return (
    <span className="pill" style={{ background: 'color-mix(in srgb, ' + color + ' 14%, #fff)', color }}>
      {glyph} {label}
    </span>
  );
}
