'use client';
import React from 'react';

// Inline boolean toggle — no dropdown for yes/no dimensions.
export default function FilterToggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={'ftgl' + (on ? ' on' : '')}
      onClick={() => onChange(!on)}
    >
      <span className="ftgl-track" aria-hidden>
        <span className="ftgl-knob" />
      </span>
      <span className="ftgl-lab">{label}</span>
    </button>
  );
}
