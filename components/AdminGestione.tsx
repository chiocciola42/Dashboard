'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import { type Calendar } from '@/lib/fiscal';
import type { Intervento, Meta, RtiConfig, MultiYearTimeline, Seniority } from '@/lib/types';
import GaraSection from './admin/GaraSection';
import GlobalRevSection from './admin/GlobalRevSection';
import IfBoSection from './admin/IfBoSection';
import DbSection from './admin/DbSection';
import ExportSection from './admin/ExportSection';
import { useToast } from './admin/shared';
import './admin-gestione.css';

const SECTIONS = ['Valori di gara', 'Revenue & Consuntivazione', 'IF / BO', 'Database', 'Export'] as const;
type Section = (typeof SECTIONS)[number];

export default function AdminGestione({
  meta: meta0,
  rti: rti0,
  multiYear: my0,
  seniority: sen0,
  interventi: ifs0,
  anno: anno0,
  anni: anni0,
}: {
  meta: Meta;
  rti: RtiConfig;
  multiYear: MultiYearTimeline;
  seniority: Seniority[];
  interventi: Intervento[];
  // Calendar year of the monthly profiles in `interventi`, and the years with data.
  anno: number;
  anni: number[];
}) {
  const [section, setSection] = useState<Section>('Valori di gara');
  const { toast, show } = useToast();

  return (
    <>
      <header>
        <div className="wrap brandrow">
          <div>
            <div className="eyebrow">Pannello amministrazione · Intellera</div>
            <h1>Gestione dati · ARIA SISS L2</h1>
          </div>
          <div className="hdr-right">
            <Link href="/dashboard" className="hdr-link">
              ← Torna alla Dashboard
            </Link>
          </div>
        </div>
      </header>

      <nav className="tabbar">
        <div className="wrap" id="tabs">
          {SECTIONS.map((s, i) => (
            <button
              key={s}
              className={'tab' + (s === section ? ' on' : '')}
              onClick={() => setSection(s)}
            >
              <span className="ti">{i + 1}</span>
              {s}
            </button>
          ))}
        </div>
      </nav>

      <main className="wrap" style={{ paddingTop: 22, paddingBottom: 60 }}>
        {section === 'Valori di gara' && <GaraSection meta0={meta0} rti0={rti0} sen0={sen0} show={show} />}
        {section === 'Revenue & Consuntivazione' && <GlobalRevSection my0={my0} show={show} />}
        {section === 'IF / BO' && <IfBoSection ifs0={ifs0} anno0={anno0} anni0={anni0} show={show} />}
        {section === 'Database' && <DbSection show={show} />}
        {section === 'Export' && <ExportSection show={show} />}
      </main>

      {toast && <div className={'toast' + (toast.bad ? ' bad' : '')}>{toast.msg}</div>}
    </>
  );
}
