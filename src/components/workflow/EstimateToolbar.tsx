import React from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
import type { EstimateWorkspaceView } from '../../shared/types/projectWorkflow';
import type { RoomRecord } from '../../shared/types/estimator';
import { TAKEOFF_ALL_ROOMS } from '../../shared/constants/workspaceUi';
import { formatLaborDurationMinutes, formatNumberSafe } from '../../utils/numberFormat';

interface EstimateToolbarProps {
  view: EstimateWorkspaceView;
  onViewChange: (view: EstimateWorkspaceView) => void;
  takeoffRoomFilter: string;
  onTakeoffRoomFilterChange: (roomId: string) => void;
  rooms: RoomRecord[];
  lineCountForFilter: number;
  takeoffStats: { lineCount: number; totalQty: number; laborMinutes: number };
  onAddManualLine: () => void;
  onOpenCatalog: () => void;
  onOpenBundles: () => void;
  activeRoomId: string;
  activeRoomLabel: string;
  /** Project total when pricing view */
  projectTotal?: number;
  formatCurrency: (n: number | undefined) => string;
  disabledAdd?: boolean;
}

export function EstimateToolbar({
  view,
  onViewChange,
  takeoffRoomFilter,
  onTakeoffRoomFilterChange,
  rooms,
  lineCountForFilter,
  takeoffStats,
  onAddManualLine,
  onOpenCatalog,
  onOpenBundles,
  activeRoomId,
  activeRoomLabel,
  projectTotal,
  formatCurrency,
  disabledAdd,
}: EstimateToolbarProps) {
  return (
    <div className="space-y-2">
      <div className="ui-panel-muted px-3 py-2.5">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-900">Estimate</span>
            <div className="inline-flex rounded-lg border border-slate-200/90 bg-white p-0.5 shadow-sm">
              <button
                type="button"
                onClick={() => onViewChange('quantities')}
                className={`rounded-md px-2.5 py-1 text-[11px] font-semibold ${view === 'quantities' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                Quantities
              </button>
              <button
                type="button"
                onClick={() => onViewChange('pricing')}
                className={`rounded-md px-2.5 py-1 text-[11px] font-semibold ${view === 'pricing' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                Pricing
              </button>
            </div>
            {view === 'quantities' ? (
              <>
                <span className="hidden h-3 w-px bg-slate-200 lg:inline" aria-hidden />
                <span className="rounded-md border border-slate-200/90 bg-white px-2 py-0.5 text-[11px] font-medium tabular-nums text-slate-700">
                  {takeoffStats.lineCount} ln
                </span>
                <span className="rounded-md border border-slate-200/90 bg-white px-2 py-0.5 text-[11px] font-medium tabular-nums text-slate-700">
                  {formatNumberSafe(takeoffStats.totalQty, 1)} qty
                </span>
                <span className="rounded-md border border-slate-200/90 bg-white px-2 py-0.5 text-[11px] font-medium tabular-nums text-slate-700">
                  {formatLaborDurationMinutes(takeoffStats.laborMinutes)}
                </span>
              </>
            ) : projectTotal != null ? (
              <>
                <span className="hidden h-3 w-px bg-slate-200 lg:inline" aria-hidden />
                <span className="text-[11px] font-medium text-slate-600">
                  Project total <span className="font-semibold tabular-nums text-slate-900">{formatCurrency(projectTotal)}</span>
                </span>
              </>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
            {view === 'pricing' ? (
              <button type="button" onClick={() => onViewChange('quantities')} className="ui-btn-secondary inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-xs font-semibold">
                Quantities <ArrowRight className="h-3 w-3" />
              </button>
            ) : null}
            <button
              type="button"
              onClick={onAddManualLine}
              disabled={disabledAdd || !activeRoomId}
              className="ui-btn-primary inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Sparkles className="h-3 w-3" /> Add line
            </button>
          </div>
        </div>
      </div>

      {view === 'quantities' ? (
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <label className="block min-w-0 flex-1 text-xs font-medium text-slate-700">
            <span className="mb-0.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">View</span>
            <select
              className="ui-input h-9 w-full max-w-md text-xs font-medium text-slate-900"
              value={takeoffRoomFilter}
              onChange={(e) => onTakeoffRoomFilterChange(e.target.value)}
            >
              <option value={TAKEOFF_ALL_ROOMS}>
                All rooms ({lineCountForFilter} line{lineCountForFilter === 1 ? '' : 's'})
              </option>
              {rooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.roomName}
                </option>
              ))}
            </select>
          </label>
          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
            <button type="button" onClick={onOpenCatalog} className="ui-btn-primary inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-xs font-semibold">
              Catalog
            </button>
            <button type="button" onClick={onOpenBundles} className="ui-btn-secondary h-8 rounded-md px-2.5 text-xs font-medium">
              Bundles
            </button>
          </div>
        </div>
      ) : null}

      {view === 'quantities' ? (
        <p className="text-xs leading-snug text-slate-500">
          <span className="font-medium text-slate-700">New lines</span> use the selected room in the sidebar (
          <span className="font-medium text-slate-800">{activeRoomLabel}</span>). Switch to{' '}
          <button type="button" onClick={() => onViewChange('pricing')} className="font-semibold text-blue-800 underline decoration-slate-300 underline-offset-2">
            Pricing
          </button>{' '}
          for dollars and rollups by room.
        </p>
      ) : null}
    </div>
  );
}
