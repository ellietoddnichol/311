import React from 'react';

interface Props {
  tone?: 'takeoff' | 'estimate';
  eyebrow: string;
  title: string;
  description: string;
  actions?: React.ReactNode;
  controls?: React.ReactNode;
  summaryBar?: React.ReactNode;
}

export function WorkspaceToolbar({
  tone = 'estimate',
  eyebrow,
  title,
  description,
  actions,
  controls,
  summaryBar,
}: Props) {
  const palette = tone === 'takeoff'
    ? 'border-amber-100 bg-white'
    : 'border-slate-100 bg-white';
  const eyebrowTone = tone === 'takeoff' ? 'text-amber-700' : 'text-slate-500';

  return (
    <section className={`rounded-xl border px-4 py-2 ${palette}`}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="max-w-2xl">
          <p className={`text-xs font-medium ${eyebrowTone}`}>{eyebrow}</p>
          <h3 className="mt-0.5 text-lg font-semibold tracking-tight text-slate-950">{title}</h3>
          <p className="mt-0.5 text-xs leading-5 text-slate-600">{description}</p>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {controls || summaryBar ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {controls}
          {summaryBar}
        </div>
      ) : null}
    </section>
  );
}