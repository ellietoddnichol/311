import React from 'react';
import { BundleRecord, EstimateSummary, LineModifierRecord, ModifierRecord, ProjectJobConditions, RoomRecord, TakeoffLineRecord } from '../../shared/types/estimator';
import { CatalogItem } from '../../types';
import { EstimateAddItemsTab } from './EstimateAddItemsTab';
import { EstimateAddInsTab } from './EstimateAddInsTab';
import { PricingSummaryPanel } from './PricingSummaryPanel';
import { UnresolvedItemsPanel } from './UnresolvedItemsPanel';

export type WorkspaceSidebarMode = 'takeoff' | 'estimate';
export type WorkspaceSidebarTab = 'items' | 'conditions' | 'match' | 'addins' | 'alternates' | 'summary';

interface Props {
  mode: WorkspaceSidebarMode;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  activeTab: WorkspaceSidebarTab;
  onTabChange: (tab: WorkspaceSidebarTab) => void;
  rooms: RoomRecord[];
  activeRoomId: string;
  activeRoomName: string;
  activeRoomLineCount: number;
  bundles: BundleRecord[];
  categories: string[];
  filteredCatalog: CatalogItem[];
  catalogSearch: string;
  catalogCategory: string;
  selectedLine: TakeoffLineRecord | null;
  modifiers: ModifierRecord[];
  activeLineModifiers: LineModifierRecord[];
  jobConditions: ProjectJobConditions;
  baseLaborRatePerHour: number;
  effectiveLaborRatePerHour: number;
  projectLaborMultiplier: number;
  roomNamesById: Record<string, string>;
  unresolvedLines: TakeoffLineRecord[];
  selectedLineId: string | null;
  summary: EstimateSummary | null;
  currentScopeLabel: string;
  onCatalogSearch: (value: string) => void;
  onCatalogCategory: (value: string) => void;
  onAddCatalogItem: (item: CatalogItem, qty: number, roomId: string) => Promise<void> | void;
  onAddBundle: (bundleId: string, roomId: string) => Promise<void> | void;
  onAddManualLine: () => Promise<void> | void;
  onApplyLineModifier: (modifierId: string) => Promise<void> | void;
  onApplyRoomModifier: (modifierId: string) => Promise<void> | void;
  onRemoveLineModifier: (lineModifierId: string) => Promise<void> | void;
  onPatchJobConditions: (updates: Partial<ProjectJobConditions>) => void;
  onSelectLine: (lineId: string) => void;
}

export function EstimateSidebar(props: Props) {
  const shortLabel = (tab: WorkspaceSidebarTab) => {
    switch (tab) {
      case 'items':
        return 'Add';
      case 'conditions':
        return 'Cond';
      case 'match':
        return 'Match';
      case 'addins':
        return 'Add-Ins';
      case 'alternates':
        return 'Alt';
      case 'summary':
        return 'Sum';
      default:
        return tab;
    }
  };

  const tabs = props.mode === 'takeoff'
    ? [
        { id: 'items' as const, label: 'Add Items' },
        { id: 'conditions' as const, label: 'Conditions' },
        { id: 'match' as const, label: 'Match Review' },
      ]
    : [
        { id: 'items' as const, label: 'Add Items' },
        { id: 'addins' as const, label: 'Pricing Add-Ins' },
        { id: 'alternates' as const, label: 'Alternates' },
        { id: 'summary' as const, label: 'Summary' },
      ];

  if (props.collapsed) {
    return (
      <aside className="sticky top-2 flex min-h-0 flex-col items-center gap-1 rounded-[14px] border border-slate-200/80 bg-white/96 p-1 shadow-sm">
        {props.onToggleCollapse ? (
          <button onClick={props.onToggleCollapse} className="flex h-8 w-full items-center justify-center rounded-[10px] border border-slate-200 bg-slate-50 text-[10px] font-semibold text-slate-700 transition hover:bg-white">
            Open
          </button>
        ) : null}
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => props.onTabChange(tab.id)}
            title={tab.label}
            className={`flex min-h-10 w-full items-center justify-center rounded-[10px] px-1 text-center text-[9px] font-semibold transition ${props.activeTab === tab.id ? 'bg-slate-950 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
          >
            {shortLabel(tab.id)}
          </button>
        ))}
      </aside>
    );
  }

  return (
    <aside className="sticky top-2 min-h-0 rounded-[14px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(244,247,250,0.98)_0%,rgba(249,250,251,0.98)_100%)] p-1 shadow-sm">
      <div className="mb-1 flex items-center justify-between gap-2 px-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Utility Panel</p>
        {props.onToggleCollapse ? (
          <button onClick={props.onToggleCollapse} className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-700 transition hover:bg-slate-50">
            Collapse
          </button>
        ) : null}
      </div>
      <div className="rounded-[10px] bg-slate-950 p-1 text-white shadow-sm">
        <div className={`grid gap-1 ${tabs.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
          {tabs.map((tab) => (
            <button key={tab.id} onClick={() => props.onTabChange(tab.id)} className={`rounded-[8px] px-2 py-1.5 text-[10px] font-semibold transition ${props.activeTab === tab.id ? 'bg-white text-slate-950' : 'text-slate-300 hover:bg-slate-900'}`}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-1 max-h-[calc(100vh-132px)] overflow-y-auto pr-0.5">
        {props.activeTab === 'items' ? (
          <EstimateAddItemsTab
            rooms={props.rooms}
            activeRoomId={props.activeRoomId}
            bundles={props.bundles}
            categories={props.categories}
            items={props.filteredCatalog}
            search={props.catalogSearch}
            category={props.catalogCategory}
            onSearch={props.onCatalogSearch}
            onCategory={props.onCatalogCategory}
            onAddCatalogItem={props.onAddCatalogItem}
            onAddBundle={props.onAddBundle}
            onAddManualLine={props.onAddManualLine}
          />
        ) : props.activeTab === 'match' ? (
          <UnresolvedItemsPanel
            lines={props.unresolvedLines}
            roomNamesById={props.roomNamesById}
            selectedLineId={props.selectedLineId}
            onSelectLine={props.onSelectLine}
          />
        ) : props.activeTab === 'alternates' ? (
          <div className="space-y-2.5">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Alternates / Upgrades</p>
              <p className="mt-1 text-[11px] text-slate-500">Use bundles as optional upgrade sets for the active room without changing the pricing engine.</p>
            </div>
            <div className="space-y-1.5">
              {props.bundles.slice(0, 8).map((bundle) => (
                <button key={bundle.id} onClick={() => void props.onAddBundle(bundle.id, props.activeRoomId)} className="flex w-full items-center justify-between rounded-[14px] border border-slate-200 bg-white px-3 py-2 text-left transition hover:border-blue-200 hover:bg-slate-50">
                  <div>
                    <p className="text-[12px] font-semibold text-slate-900">{bundle.bundleName}</p>
                    <p className="mt-1 text-[10px] text-slate-500">{bundle.category || 'Bundle'} · applies to {props.activeRoomName}</p>
                  </div>
                  <span className="rounded-full bg-slate-950 px-2.5 py-1 text-[10px] font-semibold text-white">Apply</span>
                </button>
              ))}
            </div>
          </div>
        ) : props.activeTab === 'summary' ? (
          <PricingSummaryPanel
            summary={props.summary}
            scopeLabel={props.currentScopeLabel}
            effectiveLaborRatePerHour={props.effectiveLaborRatePerHour}
          />
        ) : (
          <EstimateAddInsTab
            mode={props.mode}
            selectedLine={props.selectedLine}
            activeRoomName={props.activeRoomName}
            activeRoomLineCount={props.activeRoomLineCount}
            modifiers={props.modifiers}
            activeLineModifiers={props.activeLineModifiers}
            jobConditions={props.jobConditions}
            baseLaborRatePerHour={props.baseLaborRatePerHour}
            effectiveLaborRatePerHour={props.effectiveLaborRatePerHour}
            projectLaborMultiplier={props.projectLaborMultiplier}
            onApplyLineModifier={props.onApplyLineModifier}
            onApplyRoomModifier={props.onApplyRoomModifier}
            onRemoveLineModifier={props.onRemoveLineModifier}
            onPatchJobConditions={props.onPatchJobConditions}
          />
        )}
      </div>
    </aside>
  );
}