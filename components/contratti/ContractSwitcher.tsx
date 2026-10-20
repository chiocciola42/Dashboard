'use client';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

export type ContrattoOpt = { id: number; codice: string; n_bdo: number };

export const CONTRATTO_COOKIE = 'contratto_attivo';

// Selettore del contratto attivo. Il contratto vive nell'URL (/contratti/[id]):
// il cookie serve solo a riaprire l'ultimo contratto visitato.
export default function ContractSwitcher({
  contratti,
  currentId,
}: {
  contratti: ContrattoOpt[];
  currentId: number | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const current = contratti.find((c) => c.id === currentId) ?? null;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? contratti.filter((c) => c.codice.toLowerCase().includes(t)) : contratti;
  }, [contratti, q]);

  const go = (id: number | null) => {
    document.cookie = `${CONTRATTO_COOKIE}=${id ?? ''}; path=/; max-age=31536000; samesite=lax`;
    setOpen(false);
    setQ('');
    router.push(id == null ? '/contratti' : `/contratti/${id}`);
  };

  return (
    <div className="fdd" ref={root}>
      <button type="button" className={'fdd-trig' + (current ? ' on' : '')} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="fdd-lab">Contratto: {current ? current.codice : 'tutti'}</span>
        <span className="fdd-caret" aria-hidden>▾</span>
      </button>
      {open && (
        <div className="fdd-pop" role="listbox">
          {contratti.length > 7 && (
            <input autoFocus className="fdd-search" placeholder="Cerca contratto…" value={q} onChange={(e) => setQ(e.target.value)} />
          )}
          <div className="fdd-list">
            <button type="button" role="option" aria-selected={currentId == null} className="fdd-opt" onClick={() => go(null)}>
              <span className="fdd-optlab">Tutti i contratti</span>
            </button>
            {list.map((c) => (
              <button key={c.id} type="button" role="option" aria-selected={c.id === currentId} className="fdd-opt" onClick={() => go(c.id)}>
                <span className="fdd-optlab">{c.codice}</span>
                <span className="fdd-optcount">{c.n_bdo} BdO</span>
              </button>
            ))}
            {!list.length && <div className="fdd-none">Nessun contratto</div>}
          </div>
        </div>
      )}
    </div>
  );
}
