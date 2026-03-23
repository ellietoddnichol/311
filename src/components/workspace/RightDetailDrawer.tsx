import React from 'react';
import { BundleRecord, ModifierRecord, TakeoffLineRecord } from '../../shared/types/estimator';
import { BundleSelector } from './BundleSelector';
import { ModifierPanel } from './ModifierPanel';
import { formatCurrencySafe, formatNumberSafe } from '../../utils/numberFormat';

interface Props {
  viewMode: 'takeoff' | 'estimate';
  selectedLine: TakeoffLineRecord | null;
  modifiers: ModifierRecord[];
  bundles: BundleRecord[];
  onPatchLine: (lineId: string, updates: Partial<TakeoffLineRecord>) => void;
  onPersistLine: (lineId: string) => void;
  activeLineModifiers: Array<{
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
  onApplyBundle: (bundleId: string) => void;
}

export function RightDetailDrawer({
  viewMode,
  selectedLine,
  modifiers,
  bundles,
  onPatchLine,
  onPersistLine,
  activeLineModifiers,
  onApplyModifier,
  onRemoveModifier,
  onApplyBundle,
}: Props) {
  const isTakeoffView = viewMode === 'takeoff';

  return (
    <aside className="w-full min-w-0 border-l border-slate-100 bg-white h-[calc(100vh-170px)] overflow-y-auto px-0 py-2 space-y-2">
      <div className="rounded border border-slate-100 bg-white p-2">
        <h3 className="text-xs font-semibold text-slate-700 mb-1">{isTakeoffView ? 'Scope Line Review' : 'Selected Item'}</h3>
        {selectedLine ? (
          <div className="space-y-1.5">
            <input className="h-7 w-full rounded border border-slate-200 px-2 text-xs focus:outline-none focus:border-blue-200" value={selectedLine.description} onChange={(e) => onPatchLine(selectedLine.id, { description: e.target.value })} onBlur={() => onPersistLine(selectedLine.id)} />
            <div className="grid grid-cols-2 gap-2">
              <input type="number" className="h-7 w-full rounded border border-slate-200 px-2 text-xs focus:outline-none focus:border-blue-200" value={selectedLine.qty} onChange={(e) => onPatchLine(selectedLine.id, { qty: Number(e.target.value) || 0 })} onBlur={() => onPersistLine(selectedLine.id)} />
              <input className="h-7 w-full rounded border border-slate-200 px-2 text-xs focus:outline-none focus:border-blue-200" value={selectedLine.unit} onChange={(e) => onPatchLine(selectedLine.id, { unit: e.target.value })} onBlur={() => onPersistLine(selectedLine.id)} />
            </div>
            {isTakeoffView ? (
              <div className="rounded border border-slate-100 bg-slate-50 px-2 py-1 text-[10px] text-slate-700 space-y-0.5">
                <p>Source: <span className="font-semibold">{selectedLine.sourceType || 'manual'}</span></p>
                <p>Category: <span className="font-semibold">{selectedLine.category || 'Uncategorized'}</span></p>
                <p>Catalog Match: <span className="font-semibold">{selectedLine.catalogItemId ? 'Matched' : 'Unmatched'}</span></p>
              </div>
            ) : (
              <div className="rounded border border-slate-100 bg-slate-50 px-2 py-1 text-[10px] text-slate-600 grid grid-cols-3 gap-1">
                <div>Base Min: <span className="font-semibold text-slate-800">{formatNumberSafe(selectedLine.laborMinutes, 1)}</span></div>
                <div>Base $: <span className="font-semibold text-slate-800">{formatCurrencySafe(selectedLine.baseLaborCost)}</span></div>
                <div>Labor $: <span className="font-semibold text-slate-800">{formatCurrencySafe(selectedLine.laborCost)}</span></div>
              </div>
            )}
            <textarea rows={2} className="w-full rounded border border-slate-200 px-2 py-1 text-xs focus:outline-none focus:border-blue-200" value={selectedLine.notes || ''} onChange={(e) => onPatchLine(selectedLine.id, { notes: e.target.value || null })} onBlur={() => onPersistLine(selectedLine.id)} />
          </div>
        ) : (
          <p className="text-xs text-slate-400">Select a row to edit details.</p>
        )}
      </div>

      {isTakeoffView ? (
        <div className="rounded border border-slate-100 bg-slate-50 p-2">
          <h3 className="text-xs font-semibold text-slate-700 mb-1">Takeoff Guidance</h3>
          <div className="space-y-1 text-xs text-slate-600">
            <p>Use Takeoff to normalize descriptions, quantities, units, and room assignment before pricing decisions.</p>
            <p>Move to Estimate when the line is mapped and ready for labor/material and modifier adjustments.</p>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white p-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 mb-1.5">Modifiers</h3>
          <ModifierPanel
            modifiers={modifiers}
            activeModifiers={activeLineModifiers}
            selectedLinePresent={!!selectedLine}
            onApplyModifier={onApplyModifier}
            onRemoveModifier={onRemoveModifier}
          />
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 mb-1.5">{isTakeoffView ? 'Suggested Bundles' : 'Bundles'}</h3>
        <BundleSelector bundles={bundles} onApplyBundle={onApplyBundle} />
      </div>
    </aside>
  );
}
