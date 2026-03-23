import React, { useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Layers3, Sparkles } from 'lucide-react';
import { LineModifierRecord, RoomRecord, TakeoffLineRecord } from '../../shared/types/estimator';
import { formatCurrencySafe, formatNumberSafe } from '../../utils/numberFormat';
import { CompactMetadataLine } from './CompactMetadataLine';
import { ConditionsSummaryChip } from './ConditionsSummaryChip';
import { GroupedSectionHeader } from './GroupedSectionHeader';

interface Props {
  lines: TakeoffLineRecord[];
  rooms: RoomRecord[];
  categories: string[];
  roomNamesById: Record<string, string>;
  pricingMode: 'material_only' | 'labor_only' | 'labor_and_material';
  viewMode: 'takeoff' | 'estimate';
  organizeBy: 'room' | 'category';
  laborMultiplier?: number;
  lineModifiersByLineId?: Record<string, LineModifierRecord[]>;
  compactMode?: boolean;
  selectedLineId: string | null;
  onSelectLine: (lineId: string) => void;
  onPersistLine: (lineId: string, updates?: Partial<TakeoffLineRecord>) => Promise<void> | void;
  onDeleteLine: (lineId: string) => void;
}

interface DisplayRow {
  id: string;
  lineId: string;
  roomLabel: string;
  roomHint: string | null;
  category: string | null;
  description: string;
  qty: number;
  unit: string;
  notes: string | null;
  matched: boolean;
  sourceType: string;
  sourceRef: string | null;
  sku: string | null;
  materialCost: number;
  laborCost: number;
  unitSell: number;
  lineTotal: number;
  bundleId: string | null;
  canDelete: boolean;
}

interface GroupedRows {
  key: string;
  title: string;
  quantityTotal: number;
  subtotal: number;
  unresolvedCount: number;
  rows: DisplayRow[];
}

function normalizeGroupKey(line: TakeoffLineRecord): string {
  const catalogKey = String(line.catalogItemId || '').trim().toLowerCase();
  if (catalogKey) return `catalog:${catalogKey}`;

  const skuKey = String(line.sku || '').trim().toLowerCase();
  if (skuKey) return `sku:${skuKey}`;

  return [line.category || '', line.description || '', line.unit || 'EA']
    .map((part) => String(part).trim().toLowerCase())
    .join('|');
}

export function EstimateGrid({ lines, rooms, categories, roomNamesById, pricingMode, viewMode, organizeBy, laborMultiplier = 1, lineModifiersByLineId = {}, compactMode = false, selectedLineId, onSelectLine, onPersistLine, onDeleteLine }: Props) {
  const [collapsedBundles, setCollapsedBundles] = useState<Record<string, boolean>>({});
  const [expandedLineId, setExpandedLineId] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const showMaterial = pricingMode !== 'labor_only';
  const showLabor = pricingMode !== 'material_only';
  const isTakeoffView = viewMode === 'takeoff';
  const hideUnitColumn = !isTakeoffView && compactMode;
  // Remove unused column counts

  const bundleMeta = useMemo(() => {
    const byBundle: Record<string, { count: number; subtotal: number; name: string }> = {};
    lines.forEach((line) => {
      if (!line.bundleId) return;
      if (!byBundle[line.bundleId]) {
        byBundle[line.bundleId] = {
          count: 0,
          subtotal: 0,
          name: line.notes?.trim() || line.category || 'Bundle',
        };
      }
      byBundle[line.bundleId].count += 1;
      byBundle[line.bundleId].subtotal += line.lineTotal;
    });
    return byBundle;
  }, [lines]);

  const sourceBadgeClass = (sourceType: string) => {
    const key = String(sourceType || '').toLowerCase();
    if (key.includes('bundle')) return 'bg-violet-50 text-violet-700 border-violet-200';
    if (key.includes('catalog')) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (key.includes('manual')) return 'bg-amber-50 text-amber-700 border-amber-200';
    if (key.includes('takeoff') || key.includes('parser')) return 'bg-sky-50 text-sky-700 border-sky-200';
    return 'bg-slate-100 text-slate-600 border-slate-200';
  };

  const rowAccentClass = (line: TakeoffLineRecord) => {
    if (line.bundleId) return 'border-l-violet-300';
    const key = String(line.sourceType || '').toLowerCase();
    if (key.includes('catalog')) return 'border-l-emerald-300';
    if (key.includes('manual')) return 'border-l-amber-300';
    if (key.includes('takeoff') || key.includes('parser')) return 'border-l-sky-300';
    return 'border-l-slate-200';
  };

  function stopRowEvent(event: React.SyntheticEvent) {
    event.stopPropagation();
  }

  const displayRows = useMemo<DisplayRow[]>(() => {
    return lines.map((line) => ({
      id: line.id,
      lineId: line.id,
      roomLabel: roomNamesById[line.roomId] || 'Unassigned',
      roomHint: null,
      category: line.category,
      description: line.description,
      qty: line.qty,
      unit: line.unit,
      notes: line.notes,
      matched: !!line.catalogItemId,
      sourceType: line.sourceType || 'line',
      sourceRef: line.sourceRef,
      sku: line.sku,
      materialCost: line.materialCost,
      laborCost: line.laborCost,
      unitSell: line.unitSell,
      lineTotal: line.lineTotal,
      bundleId: line.bundleId,
      canDelete: true,
    }));
  }, [lines, roomNamesById]);

  const groupedRows = useMemo<GroupedRows[]>(() => {
    const groups = new Map<string, GroupedRows>();

    displayRows.forEach((row) => {
      const groupKey = organizeBy === 'category'
        ? (row.category || 'Uncategorized')
        : row.roomLabel;

      const existing = groups.get(groupKey) || {
        key: groupKey,
        title: groupKey,
        quantityTotal: 0,
        subtotal: 0,
        unresolvedCount: 0,
        rows: [],
      };

      existing.rows.push(row);
      existing.quantityTotal += Number(row.qty || 0);
      existing.subtotal += Number(row.lineTotal || 0);
      existing.unresolvedCount += row.matched ? 0 : 1;
      groups.set(groupKey, existing);
    });

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        rows: group.rows.sort((left, right) => right.lineTotal - left.lineTotal || left.description.localeCompare(right.description)),
      }))
      .sort((left, right) => left.title.localeCompare(right.title));
  }, [displayRows, organizeBy]);

  function handleSelectLine(lineId: string) {
    onSelectLine(lineId);
    if (!isTakeoffView) {
      gridRef.current?.focus();
    }
  }

  function handleGridKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (isTakeoffView) return;
    const target = event.target as HTMLElement | null;
    if (!target) return;
    const tagName = target.tagName;
    if (target.isContentEditable || tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT' || tagName === 'BUTTON') {
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
      return;
    }

    event.preventDefault();
    const flatRows = groupedRows.flatMap((group) => group.rows);

    if (flatRows.length === 0) return;

    const currentIndex = selectedLineId ? flatRows.findIndex((row) => row.lineId === selectedLineId) : -1;
    if (event.key === 'ArrowDown') {
      const nextIndex = currentIndex < 0 ? 0 : Math.min(currentIndex + 1, flatRows.length - 1);
      handleSelectLine(flatRows[nextIndex].lineId);
      return;
    }

    const nextIndex = currentIndex < 0 ? flatRows.length - 1 : Math.max(currentIndex - 1, 0);
    handleSelectLine(flatRows[nextIndex].lineId);
  }

  function renderTakeoffHeader() {
    return (
      <div className="grid grid-cols-[minmax(0,1.2fr)_92px_76px_1fr_1fr_92px] gap-2 px-3 py-1 text-xs font-semibold text-slate-600 border-b border-slate-200 bg-white">
        <div>Item</div>
        <div>Qty</div>
        <div>Unit</div>
        <div>Room / Category</div>
        <div>Add-ins / Scopes</div>
        <div className="text-right">Actions</div>
      </div>
    );
  }

  function renderEstimateHeader() {
    return (
      <div className="grid grid-cols-[minmax(0,0.9fr)_72px_112px_112px_128px_112px_112px] gap-2.5 px-3 py-1 text-xs font-semibold text-slate-700 border-b border-slate-200 bg-white">
        <div>Item</div>
        <div>Qty</div>
        <div>Material</div>
        <div>Labor</div>
        <div>Conditions</div>
        <div>Total</div>
        <div>Sell</div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-none border-0 bg-white w-full min-w-0 m-0 p-0" style={{ fontFamily: 'var(--font-sans)', fontSize: 14 }}>
      <div
        ref={gridRef}
        tabIndex={isTakeoffView ? -1 : 0}
        onKeyDown={handleGridKeyDown}
        className="max-h-[75vh] overflow-y-auto focus:outline-none focus:ring-2 focus:ring-blue-200/30 focus:ring-inset"
        aria-label={isTakeoffView ? 'Takeoff grid' : 'Estimate grid. Use up and down arrow keys to move between selected rows.'}
      >
        <div className={`sticky top-0 z-10 border-b backdrop-blur ${isTakeoffView ? 'border-amber-200/70 bg-[linear-gradient(180deg,rgba(255,249,235,0.96)_0%,rgba(255,255,255,0.92)_100%)]' : 'border-slate-200/70 bg-[linear-gradient(180deg,rgba(245,248,252,0.96)_0%,rgba(255,255,255,0.92)_100%)]'}`}>
          {isTakeoffView ? renderTakeoffHeader() : renderEstimateHeader()}
        </div>

        {groupedRows.length === 0 ? (
          <div className="px-3 py-12 text-center">
            <div className="mx-auto max-w-md rounded-xl border border-dashed border-slate-200 bg-slate-50 px-5 py-6">
              <p className="text-xs font-semibold text-slate-500">{isTakeoffView ? 'Takeoff Workspace' : 'Estimate Workspace'}</p>
              <p className="mt-2 text-base font-semibold text-slate-900">No lines in this view</p>
              <p className="mt-1 text-sm leading-5 text-slate-500">Use the Add Items panel to insert catalog items, apply a bundle, or create a manual line for the active room.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-2 p-2">
            {groupedRows.map((group) => (
              <section key={group.key} className="space-y-1.5">
                <GroupedSectionHeader
                  title={group.title}
                  lineCount={group.rows.length}
                  quantityTotal={group.quantityTotal}
                  subtotal={group.subtotal}
                  unresolvedCount={group.unresolvedCount}
                  tone={isTakeoffView ? 'takeoff' : 'estimate'}
                />

                <div className="overflow-hidden">
                  {group.rows.map((row, index) => {
                    const sourceLine = lines.find((line) => line.id === row.lineId) || null;
                    const selected = selectedLineId === row.lineId;
                    const expanded = expandedLineId === row.lineId || selected;
                    const stripe = index % 2 === 0;
                    const effectiveLaborCost = Number((row.laborCost * laborMultiplier).toFixed(2));
                    const rowModifiers = lineModifiersByLineId[row.lineId] || [];
                    const baseMaterialCost = Number(sourceLine?.baseMaterialCost || row.materialCost || 0);
                    const baseLaborCost = Number(sourceLine?.baseLaborCost || row.laborCost || 0);
                    const addInDelta = Number((((row.materialCost - baseMaterialCost) + (row.laborCost - baseLaborCost)) * row.qty).toFixed(2));
                    const totalCost = Number((((showMaterial ? row.materialCost : 0) + (showLabor ? effectiveLaborCost : 0)) * row.qty).toFixed(2));
                    const margin = row.lineTotal > 0 ? ((row.lineTotal - totalCost) / row.lineTotal) * 100 : 0;
                    const previousRow = group.rows[index - 1] || null;
                    const isBundleStart = !!row.bundleId && (!previousRow || previousRow.bundleId !== row.bundleId);
                    const isBundleCollapsed = !!row.bundleId && !!collapsedBundles[row.bundleId];

                    if (isBundleCollapsed && !isBundleStart) {
                      return null;
                    }

                    return (
                      <React.Fragment key={row.id}>
                        {isBundleStart && row.bundleId ? (
                          <div className="border-b border-slate-100 bg-slate-50 px-3 py-1">
                            <button
                              className="inline-flex items-center gap-1.5 rounded bg-white/80 px-2 py-1 text-xs font-medium text-slate-700"
                              onClick={() => {
                                setCollapsedBundles((prev) => ({
                                  ...prev,
                                  [row.bundleId!]: !prev[row.bundleId!],
                                }));
                              }}
                            >
                              {collapsedBundles[row.bundleId] ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                              <Layers3 className="h-4 w-4" />
                              {bundleMeta[row.bundleId]?.name || 'Bundle'}
                              <span className="text-slate-500">({bundleMeta[row.bundleId]?.count || 0} lines)</span>
                              <span className="ml-1 text-slate-700">{formatCurrencySafe(bundleMeta[row.bundleId]?.subtotal)}</span>
                            </button>
                          </div>
                        ) : null}

                        <div
                          onClick={() => handleSelectLine(row.lineId)}
                          className={`px-3 py-2.5 border-b border-slate-100 transition-colors ${selected ? 'bg-blue-50' : 'bg-white hover:bg-slate-50'}`}
                        >
                          {isTakeoffView ? (
                            <div className="grid grid-cols-[minmax(0,1.2fr)_92px_76px_1fr_1fr_92px] gap-2 items-center">
                              <div className="min-w-0">
                                <p className={`${compactMode ? 'line-clamp-1' : 'line-clamp-2'} text-[13px] font-semibold text-slate-900`} title={row.description}>{row.description}</p>
                              </div>
                              <div className="text-xs font-semibold text-slate-900 tabular-nums">
                                <input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  value={sourceLine?.qty ?? row.qty}
                                  onClick={stopRowEvent}
                                  onChange={(event) => {
                                    const nextQty = Number(event.target.value);
                                    onPersistLine(row.lineId, { qty: Number.isFinite(nextQty) ? nextQty : 0 });
                                  }}
                                  className="h-7 w-16 rounded border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-900 outline-none"
                                  aria-label={`Quantity for ${row.description}`}
                                />
                              </div>
                              <div className="text-xs font-medium text-slate-700">{row.unit}</div>
                              <div className="text-xs text-slate-600">
                                <p className="font-medium text-slate-900">{row.roomLabel}</p>
                                <p className="mt-0.5 text-xs text-slate-400">{row.category || 'Uncategorized'}</p>
                              </div>
                              <div>
                                {/* Show only add-ins/scopes badges, not cost deltas */}
                                <ConditionsSummaryChip count={rowModifiers.length} amount={0} tone="takeoff" />
                              </div>
                              <div className="flex items-start justify-end gap-1" onClick={stopRowEvent}>
                                <button onClick={() => setExpandedLineId((current) => current === row.lineId ? null : row.lineId)} className="rounded border border-slate-200 bg-white px-2 py-0.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50">{expanded ? 'Hide' : 'Open'}</button>
                                {row.canDelete ? <button onClick={(event) => { event.stopPropagation(); onDeleteLine(row.lineId); }} className="rounded border border-transparent px-2 py-0.5 text-xs font-medium text-slate-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700">Delete</button> : null}
                              </div>
                            </div>
                          ) : (
                            <div className="grid grid-cols-[minmax(0,0.9fr)_72px_112px_112px_128px_112px_112px] gap-2.5">
                              <div className="min-w-0">
                                <p className={`${compactMode ? 'line-clamp-1' : 'line-clamp-2'} text-[12px] font-semibold text-slate-900`} title={row.description}>{row.description}</p>
                                <CompactMetadataLine
                                  tone="estimate"
                                  parts={[
                                    row.category,
                                    row.sku ? `SKU: ${row.sku}` : null,
                                    row.roomLabel,
                                  ]}
                                />
                              </div>
                              <div className="text-[11px] font-semibold text-slate-900">{formatNumberSafe(row.qty, 2)}{hideUnitColumn ? ` ${row.unit}` : ''}</div>
                              <div className="text-[11px] font-medium text-slate-700">{formatCurrencySafe(showMaterial ? baseMaterialCost * row.qty : 0)}</div>
                              <div className="text-[11px] font-medium text-slate-700">
                                <div>{formatCurrencySafe(showLabor ? effectiveLaborCost * row.qty : 0)}</div>
                                {laborMultiplier !== 1 && showLabor ? <p className="mt-1 text-[10px] text-slate-500">eff. {formatCurrencySafe(effectiveLaborCost)}/unit</p> : null}
                              </div>
                              <div>
                                <ConditionsSummaryChip count={rowModifiers.length} amount={addInDelta} tone="estimate" />
                              </div>
                              <div className="text-[11px] font-semibold text-slate-900">{formatCurrencySafe(totalCost)}</div>
                              <div className="text-[11px] font-semibold text-slate-900">{formatCurrencySafe(row.lineTotal)}</div>
                            </div>
                          )}

                          {expanded ? (
                            <div className="mt-2 rounded bg-slate-50 px-3 py-2 text-xs border border-slate-100">
                              <div className="grid gap-2 xl:grid-cols-[minmax(0,1.4fr)_minmax(220px,0.9fr)]">
                                <div className="space-y-2">
                                  <div>
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Line Detail</p>
                                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                                      <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-medium text-slate-700 ring-1 ring-slate-200/80">{row.roomLabel}</span>
                                      {row.category ? <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-medium text-slate-700 ring-1 ring-slate-200/80">{row.category}</span> : null}
                                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-medium ring-1 ${row.matched ? 'bg-emerald-50 text-emerald-700 ring-emerald-200/80' : 'bg-amber-50 text-amber-800 ring-amber-200/80'}`}>{row.matched ? 'Matched line' : 'Unresolved line'}</span>
                                      {row.sku ? <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-medium text-slate-700 ring-1 ring-slate-200/80">SKU {row.sku}</span> : null}
                                    </div>
                                  </div>
                                  <div className="grid gap-2 sm:grid-cols-2">
                                    <div className="rounded-[14px] bg-white px-3 py-2 ring-1 ring-slate-200/80">
                                      <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Source</p>
                                      <p className="mt-1 text-[11px] font-medium text-slate-900">{row.sourceType}</p>
                                      <p className="mt-1 text-[10px] text-slate-500">{row.sourceRef || 'No extraction source attached'}</p>
                                    </div>
                                    <div className="rounded-[14px] bg-white px-3 py-2 ring-1 ring-slate-200/80">
                                      <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Conditions</p>
                                      <p className="mt-1 text-[11px] font-medium text-slate-900">{rowModifiers.length} applied</p>
                                      <p className="mt-1 text-[10px] text-slate-500">{addInDelta > 0 ? `Adds ${formatCurrencySafe(addInDelta)} to this line` : 'No cost delta from conditions or modifiers'}</p>
                                    </div>
                                  </div>
                                </div>
                                <div className="rounded-[14px] bg-white px-3 py-2 ring-1 ring-slate-200/80">
                                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Notes & Pricing</p>
                                  <p className="mt-2 text-[11px] leading-5 text-slate-600">{row.notes || 'No notes or extraction comments on this line.'}</p>
                                  {!isTakeoffView ? (
                                    <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-2 text-[11px] text-slate-600">
                                      <div className="flex items-center justify-between"><span>Total Cost</span><span className="font-semibold text-slate-900">{formatCurrencySafe(totalCost)}</span></div>
                                      <div className="flex items-center justify-between"><span>Sell Price</span><span className="font-semibold text-slate-900">{formatCurrencySafe(row.lineTotal)}</span></div>
                                      <div className="flex items-center justify-between"><span>Margin</span><span className="font-semibold text-slate-900">{formatNumberSafe(margin, 1)}%</span></div>
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </React.Fragment>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
