'use client';
import React, { useCallback, useRef } from 'react';
import { TABS, nextTabIndex } from '@/lib/dashboardView';

// Accessible tab navigation (WCAG 2.1 AA / AgID, requisito PA): roving-tabindex
// tablist where only the active tab is in the tab order; ←/→ move focus +
// selection, Home/End jump to the ends. Mirrors the native ARIA APG pattern so
// screen readers announce "scheda N di 7, selezionata".
export default function DashboardTabs({ tab, onSelect }: { tab: number; onSelect: (i: number) => void }) {
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const goToTab = useCallback(
    (i: number) => {
      onSelect(i);
      tabRefs.current[i]?.focus();
    },
    [onSelect],
  );
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent, i: number) => {
      const next = nextTabIndex(e.key, i, TABS.length);
      if (next === null) return;
      e.preventDefault();
      goToTab(next);
    },
    [goToTab],
  );

  return (
  <nav className="tabbar" aria-label="Sezioni della dashboard">
    <div className="wrap" id="tabs" role="tablist" aria-label="Sezioni della dashboard">
      {TABS.map((t, i) => (
        <button
          key={i}
          ref={(el) => {
            tabRefs.current[i] = el;
          }}
          id={`tab-${i}`}
          role="tab"
          aria-selected={i === tab}
          aria-controls={`tabpanel-${i}`}
          tabIndex={i === tab ? 0 : -1}
          className={'tab' + (i === tab ? ' on' : '')}
          onClick={() => onSelect(i)}
          onKeyDown={(e) => onKeyDown(e, i)}
        >
          <span className="ti" aria-hidden>
            {i + 1}
          </span>
          {t}
        </button>
      ))}
    </div>
  </nav>
  );
}
