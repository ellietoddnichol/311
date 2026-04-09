import React from 'react';
import type { ModifierRecord, RoomRecord, TakeoffLineRecord } from '../../shared/types/estimator';
import { CatalogCategorySelect } from '../intake/CatalogCategorySelect';
import { ModifierPanel } from './ModifierPanel';
import { formatCurrencySafe, formatLaborDurationMinutes, formatNumberSafe } from '../../utils/numberFormat';

export interface LineEditorPanelProps {
  variant: 'overlay' | 'inline';
  selectedLine: TakeoffLineRecord;
  rooms: RoomRecord[];
  roomNamesById: Record<string, string>;
  scopeCategoryOptions: string[];
  patchLineLocal: (lineId: string, updates: Partial<TakeoffLineRecord>) => void;
  persistLine: (lineId: string) => void | Promise<void>;
  lineQtyInputProps: React.InputHTMLAttributes<HTMLInputElement>;
  lineMaterialInputProps: React.InputHTMLAttributes<HTMLInputElement>;
  lineLaborInputProps: React.InputHTMLAttributes<HTMLInputElement>;
  lineUnitSellInputProps: React.InputHTMLAttributes<HTMLInputElement>;
  showMaterial: boolean;
  showLabor: boolean;
  conditionLaborMultiplier: number;
  resetLineToCalculatedPrice: (lineId: string) => void | Promise<void>;
  modifiers: ModifierRecord[];
  lineModifiers: Array<{
    id: string;
    lineId: string;
    modifierId: string;
    name: string;
    addMaterialCost: number;
    addLaborMinutes: number;
    percentMaterial: number;
    percentLabor: number;
    createdAt: string;
  }>;
  onApplyModifier: (modifierId: string) => void;
  onRemoveModifier: (lineModifierId: string) => void;
  onDone: () => void;
}

export function LineEditorPanel({
  variant,
  selectedLine,
  rooms,
  roomNamesById,
  scopeCategoryOptions,
  patchLineLocal,
  persistLine,
  lineQtyInputProps,
  lineMaterialInputProps,
  lineLaborInputProps,
  lineUnitSellInputProps,
  showMaterial,
  showLabor,
  conditionLaborMultiplier,
  resetLineToCalculatedPrice,
  modifiers,
  lineModifiers,
  onApplyModifier,
  onRemoveModifier,
  onDone,
}: LineEditorPanelProps) {
  const bodyGridClass =
    variant === 'overlay'
      ? 'grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[1fr_280px]'
      : 'flex min-h-0 flex-1 flex-col overflow-hidden';

  const mainScrollClass =
    variant === 'overlay' ? 'min-h-0 overflow-y-auto p-3 sm:p-4' : 'min-h-0 flex-1 overflow-y-auto p-3';

  const modifierWrapClass =
    variant === 'overlay'
      ? 'border-t border-slate-200/80 bg-[linear-gradient(180deg,rgba(248,250,252,0.96)_0%,rgba(241,245,249,0.98)_100%)] p-3 lg:border-l lg:border-t-0'
      : 'max-h-[min(40vh,320px)] shrink-0 overflow-y-auto border-t border-slate-200/80 bg-[linear-gradient(180deg,rgba(248,250,252,0.96)_0%,rgba(241,245,249,0.98)_100%)] p-3';

  const rootClass =
    variant === 'overlay'
      ? 'flex h-full w-full max-w-[min(100vw-0.5rem,56rem)] flex-col overflow-hidden border-l border-slate-200/90 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] shadow-[-12px_0_40px_rgba(15,23,42,0.14)]'
      : 'flex max-h-[min(70vh,820px)] min-h-[280px] flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] shadow-sm xl:max-h-[calc(100vh-170px)]';

  return (
    <div className={rootClass}>
      <div className="border-b border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(246,248,251,0.96)_100%)] px-3 py-2.5 sm:px-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 max-w-[min(100%,42rem)]">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Line detail drawer</p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className="ui-chip-soft">{selectedLine.category || 'Uncategorized'}</span>
              <span className="ui-chip-soft">{roomNamesById[selectedLine.roomId] || 'Unassigned room'}</span>
            </div>
            <h3 className="mt-1 text-base font-semibold tracking-tight text-slate-950">Quick edit</h3>
          </div>
          <button
            type="button"
            onClick={onDone}
            className="h-9 shrink-0 rounded-full border border-slate-200 bg-white px-3 text-[11px] font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            {variant === 'inline' ? 'Close' : 'Done'}
          </button>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-lg bg-white p-2 shadow-sm ring-1 ring-slate-200/80">
            <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-500">Qty</p>
            <p className="mt-0.5 text-base font-semibold tabular-nums text-slate-950">{formatNumberSafe(selectedLine.qty, 0)}</p>
          </div>
          <div className="rounded-lg bg-white p-2 shadow-sm ring-1 ring-slate-200/80">
            <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-500">Material</p>
            <p className="mt-0.5 text-base font-semibold tabular-nums text-slate-950">{formatCurrencySafe(selectedLine.materialCost)}</p>
          </div>
          <div className="rounded-lg bg-white p-2 shadow-sm ring-1 ring-slate-200/80">
            <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-500">Labor</p>
            <p className="mt-0.5 text-base font-semibold tabular-nums text-slate-950">{formatCurrencySafe(selectedLine.laborCost)}</p>
          </div>
          <div className="rounded-lg bg-[linear-gradient(180deg,#10284f_0%,#0a224d_100%)] p-2 text-white shadow-sm sm:col-span-1 col-span-2">
            <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-300">Unit Sell</p>
            <p className="mt-0.5 text-base font-semibold tabular-nums">{formatCurrencySafe(selectedLine.unitSell)}</p>
          </div>
        </div>
      </div>

      <div className={bodyGridClass}>
        <div className={mainScrollClass}>
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
            <div className="space-y-3">
              <div className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200/80">
                <p className="text-[11px] font-semibold text-slate-900">Line details</p>
                <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                  <label className="text-[11px] font-medium text-slate-700 md:col-span-2">
                    Description
                    <input
                      className="ui-input mt-1 h-9 rounded-lg"
                      value={selectedLine.description}
                      onChange={(e) => patchLineLocal(selectedLine.id, { description: e.target.value })}
                      onBlur={() => void persistLine(selectedLine.id)}
                    />
                  </label>
                  <label className="text-[11px] font-medium text-slate-700">
                    Room
                    <select
                      className="ui-input mt-1 h-9 rounded-lg"
                      value={selectedLine.roomId}
                      onChange={(e) => patchLineLocal(selectedLine.id, { roomId: e.target.value })}
                      onBlur={() => void persistLine(selectedLine.id)}
                    >
                      {rooms.map((room) => (
                        <option key={room.id} value={room.id}>
                          {room.roomName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-[11px] font-medium text-slate-700">
                    Category
                    <CatalogCategorySelect
                      className="ui-input mt-1 h-9 rounded-lg"
                      value={selectedLine.category}
                      options={scopeCategoryOptions}
                      onChange={(v) => patchLineLocal(selectedLine.id, { category: v })}
                      onBlur={() => void persistLine(selectedLine.id)}
                    />
                  </label>
                  <label className="text-[11px] font-medium text-slate-700">
                    Qty
                    <input className="ui-input mt-1 h-9 rounded-lg" {...lineQtyInputProps} />
                  </label>
                  <label className="text-[11px] font-medium text-slate-700">
                    Unit
                    <input
                      className="ui-input mt-1 h-9 rounded-lg"
                      value={selectedLine.unit}
                      onChange={(e) => patchLineLocal(selectedLine.id, { unit: e.target.value })}
                      onBlur={() => void persistLine(selectedLine.id)}
                    />
                  </label>
                  <label className="text-[11px] font-medium text-slate-700 md:col-span-2">
                    Notes
                    <textarea
                      rows={3}
                      className="ui-textarea mt-1 min-h-[72px] rounded-xl"
                      value={selectedLine.notes || ''}
                      onChange={(e) => patchLineLocal(selectedLine.id, { notes: e.target.value || null })}
                      onBlur={() => void persistLine(selectedLine.id)}
                    />
                  </label>
                </div>
              </div>

              <div className="rounded-xl bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-3 shadow-sm ring-1 ring-slate-200/80">
                <p className="text-[11px] font-semibold text-slate-900">Pricing</p>
                <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                  {showMaterial ? (
                    <label className="text-[11px] font-medium text-slate-700">
                      Material
                      <input className="ui-input mt-1 h-9 rounded-lg" {...lineMaterialInputProps} />
                    </label>
                  ) : null}
                  {showLabor ? (
                    <label className="text-[11px] font-medium text-slate-700">
                      Labor
                      <input className="ui-input mt-1 h-9 rounded-lg" {...lineLaborInputProps} />
                      {conditionLaborMultiplier !== 1 ? (
                        <p className="mt-1 text-[10px] text-slate-500">
                          Effective labor with project multiplier:{' '}
                          {formatCurrencySafe((selectedLine.laborCost || 0) * conditionLaborMultiplier)}
                        </p>
                      ) : null}
                    </label>
                  ) : null}
                  <label className="text-[11px] font-medium text-slate-700">
                    Unit Sell
                    <div className="mt-1 space-y-1.5">
                      <input className="ui-input h-9 rounded-lg" {...lineUnitSellInputProps} />
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500">
                        <span>
                          {selectedLine.pricingSource === 'manual'
                            ? 'Manual override preserved during repricing.'
                            : `Calculated from material + labor: ${formatCurrencySafe(selectedLine.materialCost + selectedLine.laborCost)}`}
                        </span>
                        <button
                          type="button"
                          onClick={() => void resetLineToCalculatedPrice(selectedLine.id)}
                          disabled={selectedLine.pricingSource !== 'manual'}
                          className="rounded-full border border-slate-200 px-2.5 py-1 text-[10px] font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Reset To Calculated
                        </button>
                      </div>
                    </div>
                  </label>
                  <div className="rounded-lg bg-white px-2.5 py-2 shadow-sm ring-1 ring-slate-200/80 md:col-span-2">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-500">Install time (per unit)</p>
                    <p className="mt-0.5 text-base font-semibold tabular-nums text-slate-950">{formatNumberSafe(selectedLine.laborMinutes, 1)} min/unit</p>
                    <p className="mt-1 text-[10px] leading-snug text-slate-600">
                      Extended for this line:{' '}
                      <span className="font-semibold tabular-nums text-slate-900">
                        {formatLaborDurationMinutes(Number(selectedLine.laborMinutes || 0) * Number(selectedLine.qty || 0))}
                      </span>
                      {Number(selectedLine.qty || 0) !== 1 ? (
                        <span className="text-slate-500">
                          {' '}
                          ({formatNumberSafe(selectedLine.qty, 0)} × {formatNumberSafe(selectedLine.laborMinutes, 1)} min)
                        </span>
                      ) : null}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="rounded-xl bg-[linear-gradient(180deg,#ffffff_0%,#f4f8ff_100%)] p-3 shadow-sm ring-1 ring-slate-200/80">
                <p className="text-[11px] font-semibold text-slate-900">Line snapshot</p>
                <div className="mt-2 space-y-1.5 text-[10px] text-slate-600">
                  <div className="flex items-center justify-between rounded-lg bg-white px-2.5 py-1.5 shadow-sm ring-1 ring-slate-200/80">
                    <span>Room</span>
                    <span className="font-semibold text-slate-900">{roomNamesById[selectedLine.roomId] || 'Unassigned'}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-white px-2.5 py-1.5 shadow-sm ring-1 ring-slate-200/80">
                    <span>Category</span>
                    <span className="font-semibold text-slate-900">{selectedLine.category || 'Uncategorized'}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-white px-2.5 py-1.5 shadow-sm ring-1 ring-slate-200/80">
                    <span>Line total</span>
                    <span className="font-semibold text-slate-900">{formatCurrencySafe(selectedLine.lineTotal)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className={modifierWrapClass}>
          <ModifierPanel
            modifiers={modifiers}
            activeModifiers={lineModifiers}
            selectedLinePresent
            onApplyModifier={onApplyModifier}
            onRemoveModifier={onRemoveModifier}
          />
        </div>
      </div>
    </div>
  );
}
