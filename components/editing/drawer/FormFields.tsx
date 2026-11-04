'use client';
import React from 'react';

// Small building blocks of the edit form. Each one renders exactly one <label>
// (text first, control after — checkboxes the other way round).

type Option = string | { value: string; label: string };

const optionEl = (o: Option) =>
  typeof o === 'string' ? (
    <option key={o}>{o}</option>
  ) : (
    <option key={o.value} value={o.value}>
      {o.label}
    </option>
  );

export function TextField({
  label,
  value,
  onChange,
  type = 'text',
  full,
  disabled,
  step,
}: {
  label: React.ReactNode;
  value: unknown;
  onChange: (v: string) => void;
  type?: 'text' | 'number' | 'date';
  full?: boolean;
  disabled?: boolean;
  step?: string;
}) {
  return (
    <label className={full ? 'full' : undefined}>
      {label}
      <input type={type} step={step} value={String(value ?? '')} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  blank,
}: {
  label: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  // Adds a leading "—" option with an empty value.
  blank?: boolean;
}) {
  return (
    <label>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {blank && <option value="">—</option>}
        {options.map(optionEl)}
      </select>
    </label>
  );
}

export function CheckField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="chk">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /> {label}
    </label>
  );
}

export function TextAreaField({
  label,
  value,
  onChange,
  rows,
}: {
  label: React.ReactNode;
  value: unknown;
  onChange: (v: string) => void;
  rows: number;
}) {
  return (
    <label className="full">
      {label}
      <textarea rows={rows} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
