import React from 'react';

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  hint?: string;
  emphasize?: boolean;
  className?: string;
}

export function StatCard({ label, value, hint, emphasize, className = '' }: StatCardProps) {
  return (
    <div
      className={`rounded-xl border p-5 shadow-sm ring-1 ring-slate-200/70 ${
        emphasize ? 'border-blue-200/80 bg-[var(--brand-soft)] ring-blue-200/60' : 'border-slate-200/80 bg-slate-50/90'
      } ${className}`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold tracking-tight tabular-nums text-slate-950 ${emphasize ? 'text-[var(--brand-strong)]' : ''}`}>
        {value}
      </p>
      {hint ? <p className="mt-1 text-[11px] text-slate-500">{hint}</p> : null}
    </div>
  );
}
