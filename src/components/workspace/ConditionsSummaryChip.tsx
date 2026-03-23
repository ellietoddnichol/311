import React from 'react';
import { formatCurrencySafe } from '../../utils/numberFormat';

interface Props {
  count: number;
  amount?: number;
  tone?: 'takeoff' | 'estimate';
}

export function ConditionsSummaryChip({ count, amount = 0, tone = 'estimate' }: Props) {
  const palette = tone === 'takeoff'
    ? 'border-amber-100 bg-amber-50 text-amber-800'
    : 'border-slate-100 bg-slate-50 text-slate-600';

  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${palette}`}>
      {count} condition{count !== 1 ? 's' : ''}
      {amount > 0 ? ` · +${formatCurrencySafe(amount)}` : ''}
    </span>
  );
}