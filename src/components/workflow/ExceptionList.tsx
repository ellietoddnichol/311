import React from 'react';
import type { TakeoffLineRecord } from '../../shared/types/estimator';
import type { ScopeLineException } from '../../shared/utils/scopeReviewExceptions';
import { StatusChip } from './StatusChip';

interface ExceptionListProps {
  exceptions: ScopeLineException[];
  linesById: Map<string, TakeoffLineRecord>;
  onOpenLine: (lineId: string) => void;
  primaryActionLabel?: string;
}

export function ExceptionList({
  exceptions,
  linesById,
  onOpenLine,
  primaryActionLabel = 'Open in estimate',
}: ExceptionListProps) {
  if (exceptions.length === 0) {
    return (
      <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/50 px-4 py-6 text-center">
        <p className="text-sm font-semibold text-emerald-900">No scope exceptions detected</p>
        <p className="mt-1 text-xs text-emerald-800/90">Imported lines are linked, quantities look valid, and categories are set.</p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200/80 bg-white shadow-sm">
      {exceptions.map((ex) => {
        const line = linesById.get(ex.lineId);
        return (
          <li key={ex.lineId} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">{line?.description || 'Line'}</p>
              <p className="mt-1 text-[11px] text-slate-500">{ex.summary}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {ex.kinds.includes('no_catalog_match') ? <StatusChip tone="warn">Catalog</StatusChip> : null}
                {ex.kinds.includes('zero_qty') ? <StatusChip tone="error">Qty</StatusChip> : null}
                {ex.kinds.includes('uncategorized') ? <StatusChip tone="warn">Category</StatusChip> : null}
                {ex.kinds.includes('missing_description') ? <StatusChip tone="error">Description</StatusChip> : null}
              </div>
            </div>
            <button type="button" onClick={() => onOpenLine(ex.lineId)} className="ui-btn-primary h-9 shrink-0 self-start px-4 text-[11px] font-semibold sm:self-center">
              {primaryActionLabel}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
