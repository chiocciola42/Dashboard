'use client';
import React, { useMemo, useState } from 'react';
import type { Intervento } from '@/lib/types';
import type { Filters } from '@/lib/queries';
import { EUR } from '@/lib/format';
import {
  buildPills,
  clearKey,
  computeDomains,
  computeFacets,
  removePill,
  setBool,
  setSingle,
  toggleMulti,
} from '@/lib/filterBar';
import FilterDropdown from './filter/FilterDropdown';
import FilterToggle from './filter/FilterToggle';

function FilterBar({
  interventi,
  fornitoriFilter,
  filters,
  setFilters,
  viewCount,
  viewTot,
}: {
  interventi: Intervento[];
  fornitoriFilter: string[];
  filters: Filters;
  setFilters: (f: Filters) => void;
  viewCount: number;
  viewTot: number;
}) {
  const [showMore, setShowMore] = useState(false);

  // Option domains depend only on the data; faceted counts also on the filters.
  const domains = useMemo(() => computeDomains(interventi, fornitoriFilter), [interventi, fornitoriFilter]);
  // Memoized: 7 full-list scans otherwise re-run on every parent re-render
  // (toast timers, saving-state flips, …), not just when filters/data change.
  const { fornOpts, statoOpts, ambOpts, refOpts, refintOpts, modOpts } = useMemo(
    () => computeFacets(interventi, filters, domains),
    [interventi, filters, domains],
  );

  // Applied-filter pills (Level-3 redundancy).
  const pills = buildPills(filters);
  const hasActive = pills.length > 0;
  const noResults = viewCount === 0 && hasActive;

  return (
    <div className="filterbar">
      <div className="wrap fbar">
        {/* Order = priority: most-used dimensions first (left). */}
        <div className="fbar-row">
          <FilterDropdown
            label="Fornitore"
            options={fornOpts}
            selected={filters.forn ?? []}
            multiple
            onToggle={(v) => setFilters(toggleMulti(filters, 'forn', v))}
            onClear={() => setFilters(clearKey(filters, 'forn'))}
          />
          <FilterDropdown
            label="Stato IF"
            options={statoOpts}
            selected={filters.stato ?? []}
            multiple
            onToggle={(v) => setFilters(toggleMulti(filters, 'stato', v))}
            onClear={() => setFilters(clearKey(filters, 'stato'))}
          />
          <FilterDropdown
            label="Ambito"
            options={ambOpts}
            selected={filters.amb ?? []}
            multiple
            onToggle={(v) => setFilters(toggleMulti(filters, 'amb', v))}
            onClear={() => setFilters(clearKey(filters, 'amb'))}
          />
          {/* Single-select (radio): an IF has one modalità. */}
          <FilterDropdown
            label="Modalità"
            options={modOpts}
            selected={filters.mod ? [filters.mod] : []}
            multiple={false}
            onToggle={(v) => setFilters(setSingle(filters, 'mod', v))}
            onClear={() => setFilters(clearKey(filters, 'mod'))}
          />
          <FilterDropdown
            label="Ref. ARIA"
            options={refOpts}
            selected={filters.ref ?? []}
            multiple
            onToggle={(v) => setFilters(toggleMulti(filters, 'ref', v))}
            onClear={() => setFilters(clearKey(filters, 'ref'))}
          />
          <FilterDropdown
            label="Ref. Intellera"
            options={refintOpts}
            selected={filters.refint ?? []}
            multiple
            onToggle={(v) => setFilters(toggleMulti(filters, 'refint', v))}
            onClear={() => setFilters(clearKey(filters, 'refint'))}
          />

          {/* Primary boolean is an inline toggle, not a dropdown. */}
          <FilterToggle label="Att. imm." on={filters.att === 'SI'} onChange={(v) => setFilters(setBool(filters, 'att', v))} />

          {/* Secondary, less-used filters tucked behind "Più filtri". */}
          <button
            type="button"
            className={'fmore' + (showMore ? ' on' : '')}
            aria-expanded={showMore}
            aria-label="Mostra filtri secondari"
            onClick={() => setShowMore((s) => !s)}
          >
            Più filtri {showMore ? '▴' : '▾'}
          </button>
          {showMore && (
            <>
              <FilterToggle label="Con BO" on={filters.bo === 'SI'} onChange={(v) => setFilters(setBool(filters, 'bo', v))} />
              <FilterToggle label="Subappalto" on={filters.sub === 'SI'} onChange={(v) => setFilters(setBool(filters, 'sub', v))} />
            </>
          )}

          <div className="fbar-spacer" />

          {/* Live result count — updates in real time as filters change. */}
          <div className="fcount" aria-live="polite">
            <b>{viewCount}</b> IF · {EUR(viewTot)}
          </div>

          {/* Global Clear-all — only present when something is active. */}
          {hasActive && (
            <button type="button" className="fclear" onClick={() => setFilters({})} aria-label="Rimuovi tutti i filtri">
              ✕ Rimuovi filtri
            </button>
          )}
        </div>

        {/* Additive lozenges: one removable pill per active value. */}
        {hasActive && (
          <div className="fpills" aria-label="Filtri applicati">
            {pills.map((p) => (
              <button key={p.id} type="button" className="fpill" onClick={() => setFilters(removePill(filters, p))} aria-label={`Rimuovi filtro ${p.text}`}>
                {p.text}
                <span className="fpill-x" aria-hidden>
                  ×
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Explicit empty state with a way out. */}
        {noResults && (
          <div className="fempty" role="status">
            <span>Nessun risultato con i filtri selezionati.</span>
            <button type="button" className="flink" onClick={() => setFilters({})}>
              Rimuovi filtri
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// The filter bar re-renders with every Dashboard state change (toasts, saving
// flags, drawer, tab); memo skips those — its props only change on data/filter
// updates (setFilters is a stable state setter).
export default React.memo(FilterBar);
