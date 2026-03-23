import React from 'react';
import { formatCurrencySafe, formatNumberSafe } from '../../utils/numberFormat';

interface Props {
  title: string;
  lineCount: number;
  quantityTotal: number;
  subtotal: number;
  unresolvedCount?: number;
  tone?: 'takeoff' | 'estimate';
}

export function GroupedSectionHeader({
  title,
  lineCount,
  quantityTotal,
  subtotal,
  unresolvedCount = 0,
  tone = 'estimate',
}: Props) {
  const palette = 'border-slate-200 bg-slate-50';

  return (
    <div className={`sticky top-0 z-10 rounded border px-3 py-1 ${palette}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">{title}</p>
        <p className="text-xs text-slate-500">
          {lineCount} lines · {formatNumberSafe(quantityTotal, 2)} qty · subtotal {formatCurrencySafe(subtotal)}
          {unresolvedCount > 0 ? ` · ${unresolvedCount} unresolved` : ' · fully matched'}
        </p>
        {unresolvedCount > 0 ? (
          <span className="rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
            {unresolvedCount} unresolved
          </span>
        ) : null}
      </div>
    </div>
  );
}