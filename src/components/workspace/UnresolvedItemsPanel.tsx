import React from 'react';
import { TakeoffLineRecord } from '../../shared/types/estimator';

interface Props {
  lines: TakeoffLineRecord[];
  roomNamesById: Record<string, string>;
  selectedLineId: string | null;
  onSelectLine: (lineId: string) => void;
}

export function UnresolvedItemsPanel({ lines, roomNamesById, selectedLineId, onSelectLine }: Props) {
  const unresolved = lines.filter((line) => !line.catalogItemId);

  return (
    <div className="space-y-2.5">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Match Review</p>
        <p className="mt-1 text-[11px] text-slate-500">Review unmatched lines, then rematch or add them manually without scanning the whole table.</p>
      </div>

      <div className="rounded-[18px] border border-slate-200/80 bg-white/95 p-2 shadow-sm">
        <div className="flex items-center justify-between gap-2 px-1 pb-2">
          <p className="text-[11px] font-semibold text-slate-900">Unresolved Queue</p>
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800 ring-1 ring-amber-200/80">
            {unresolved.length} open
          </span>
        </div>
        <div className="max-h-[58vh] space-y-1.5 overflow-y-auto pr-1">
          {unresolved.length > 0 ? unresolved.map((line) => {
            const active = selectedLineId === line.id;

            return (
              <button
                key={line.id}
                type="button"
                onClick={() => onSelectLine(line.id)}
                className={`w-full rounded-[16px] border px-3 py-2 text-left transition ${active ? 'border-amber-200 bg-amber-50/70' : 'border-slate-200 bg-slate-50/70 hover:border-amber-200 hover:bg-white'}`}
              >
                <p className="text-[12px] font-semibold text-slate-900">{line.description}</p>
                <p className="mt-1 text-[10px] text-slate-500">{roomNamesById[line.roomId] || 'Unassigned'} · Qty {line.qty} {line.unit} · {line.category || 'Uncategorized'}</p>
                <p className="mt-1 text-[10px] text-amber-800">Missing catalog match{line.sku ? ` · parsed SKU ${line.sku}` : ''}</p>
              </button>
            );
          }) : (
            <div className="rounded-[16px] border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-[12px] text-slate-500">
              All visible lines are matched. Use filters in Takeoff to focus on a room or category if needed.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}