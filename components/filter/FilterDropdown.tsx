'use client';
import React, { useEffect, useRef, useState } from 'react';
import { filterOptionsByQuery, type Opt } from '@/lib/filterBar';

// ---------------------------------------------------------------------------
// Generic dropdown (checkbox = multi, radio = single).
// Owns: open/close, click-outside, Escape, search field (auto when >7 options),
// autofocus on open. Selections are controlled by the parent so they survive
// open/close cycles (Level-1 redundancy: state preserved inside the dropdown).
// ---------------------------------------------------------------------------
export default function FilterDropdown({
  label,
  options,
  selected,
  multiple,
  onToggle,
  onClear,
}: {
  label: string;
  options: Opt[];
  selected: string[];
  multiple: boolean;
  onToggle: (value: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  // Search box only appears for long lists, where scanning a flat list is slow.
  const searchable = options.length > 7;
  const n = selected.length;

  // Close on Escape + click outside (native <select> gave this for free).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Autofocus the search field when the dropdown opens; reset query on close.
  useEffect(() => {
    if (open && searchable) {
      const t = setTimeout(() => searchRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
    if (!open) setQ('');
  }, [open, searchable]);

  const shown = filterOptionsByQuery(options, q);

  return (
    <div className="fdd" ref={rootRef}>
      {/* Level-2 redundancy: active label goes bold + numeric badge (n). */}
      <button
        type="button"
        className={'fdd-trig' + (n ? ' on' : '')}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Filtro ${label}${n ? `: ${n} selezionati` : ''}`}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="fdd-lab">{label}</span>
        {n > 0 && <span className="fdd-badge">{n}</span>}
        <span className="fdd-caret" aria-hidden>
          ▾
        </span>
      </button>

      {open && (
        <div className="fdd-pop" role="listbox" aria-label={label}>
          {searchable && (
            <input
              ref={searchRef}
              className="fdd-search"
              type="text"
              placeholder="Cerca…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label={`Cerca in ${label}`}
            />
          )}
          {/* Single-select gets an explicit "Tutte" radio to clear the choice. */}
          {!multiple && (
            <label className="fdd-opt">
              <input type="radio" name={`r-${label}`} checked={n === 0} onChange={onClear} />
              <span className="fdd-optlab">Tutte</span>
            </label>
          )}
          <div className="fdd-list">
            {shown.map((o) => {
              const checked = selected.includes(o.value);
              // Faceted UX: an option that would yield 0 results is shown but
              // disabled (unless already active, so it stays removable).
              const disabled = o.count === 0 && !checked;
              return (
                <label key={o.value} className={'fdd-opt' + (disabled ? ' dis' : '')}>
                  <input
                    type={multiple ? 'checkbox' : 'radio'}
                    name={multiple ? undefined : `r-${label}`}
                    checked={checked}
                    disabled={disabled}
                    onChange={() => onToggle(o.value)}
                  />
                  <span className="fdd-optlab">{o.value}</span>
                  <span className="fdd-optcount">{o.count}</span>
                </label>
              );
            })}
            {shown.length === 0 && <div className="fdd-none">Nessuna opzione</div>}
          </div>
        </div>
      )}
    </div>
  );
}
