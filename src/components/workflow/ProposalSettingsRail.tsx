import React from 'react';
import { StatCard } from './StatCard';
import { ProposalPresetSelector } from './ProposalPresetSelector';
import type { ProposalFormat } from '../../shared/types/estimator';
import { formatCurrencySafe, formatNumberSafe } from '../../utils/numberFormat';

interface ProposalSettingsRailProps {
  proposalFormat: ProposalFormat;
  onProposalFormatChange: (value: ProposalFormat) => void;
  baseBidTotal: number | undefined;
  lineCount: number;
  durationDays: number | undefined;
  statsSlot?: React.ReactNode;
}

export function ProposalSettingsRail({
  proposalFormat,
  onProposalFormatChange,
  baseBidTotal,
  lineCount,
  durationDays,
  statsSlot,
}: ProposalSettingsRailProps) {
  return (
    <aside className="space-y-4 lg:sticky lg:top-[88px]">
      {statsSlot ?? (
        <div className="grid gap-2.5">
          <StatCard label="Proposal total" value={formatCurrencySafe(baseBidTotal)} hint="From current estimate" />
          <StatCard label="Included lines" value={lineCount} hint="In this bid" />
          <StatCard
            label="Duration (est.)"
            value={durationDays != null && durationDays > 0 ? `${formatNumberSafe(durationDays, 1)} d` : '—'}
            hint="Schedule model"
          />
        </div>
      )}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Layout preset</p>
        <p className="mt-1 text-xs text-slate-600">Pick a format; preview updates live.</p>
        <div className="mt-3">
          <ProposalPresetSelector value={proposalFormat} onChange={onProposalFormatChange} />
        </div>
      </section>
    </aside>
  );
}
