'use client';
import React from 'react';
import Link from 'next/link';
import type { Meta, SafeUser } from '@/lib/types';
import { ROLE_LABEL } from '@/lib/auth/permissions';
import LogoutButton from '../LogoutButton';

// Brand row: title, data freshness, year selector, user chip and actions.
export default function DashboardHeader({
  meta,
  lastEdit,
  anno,
  anni,
  yearPending,
  onYearChange,
  user,
  canEdit,
  isAdmin,
  editMode,
  onToggleEdit,
}: {
  meta: Meta;
  lastEdit: Date | null;
  anno: number;
  anni: number[];
  yearPending: boolean;
  onYearChange: (y: number) => void;
  user: SafeUser;
  canEdit: boolean;
  isAdmin: boolean;
  editMode: boolean;
  onToggleEdit: () => void;
}) {
  return (
  <header>
    <div className="wrap brandrow">
      <div>
        <div className="eyebrow">Executive Dashboard · Intellera</div>
        <h1>Monitor IF/BO · ARIA SISS L2</h1>
      </div>
      <div className="hdr-right">
        <div className="metaline">
          CIG <b>{meta.cig}</b> · dati al{' '}
          <b title="Data e ora dell'ultimo caricamento dati">
            {new Date(meta.generato).toLocaleString('it-IT', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </b>
          {lastEdit && (
            <>
              {' '}· ultima modifica{' '}
              <b title="Modifica manuale più recente registrata sui dati">
                {lastEdit.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })}
              </b>
            </>
          )}
        </div>
        <label className="yrsel" title="Anno a cui si riferiscono i profili mensili (revenue e consuntivazione)">
          Anno
          <select
            className="tl-year"
            value={anno}
            onChange={(e) => onYearChange(Number(e.target.value))}
            disabled={yearPending}
            aria-label="Anno di riferimento"
          >
            {anni.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <div className="userchip">
          <span className="uname">{user.name || user.email}</span>
          <span className="rolepill" title={ROLE_LABEL[user.role]}>{user.role}</span>
        </div>
        <div className="exp">
          {canEdit && (
            <button className={editMode ? '' : 'ghost'} onClick={onToggleEdit}>
              {editMode ? '🔓 Modalità modifica attiva' : '🔒 Abilita modifica'}
            </button>
          )}
          {canEdit && (
            <Link href="/upload" className="hdr-link">
              ⤴ Carica dati
            </Link>
          )}
          {isAdmin && (
            <Link href="/admin/gestione" className="hdr-link">
              ⚙ Gestione dati
            </Link>
          )}
          {isAdmin && (
            <Link href="/admin/users" className="hdr-link">
              👥 Utenti
            </Link>
          )}
          <LogoutButton className="logout" label="Esci" />
        </div>
      </div>
    </div>
  </header>
  );
}
