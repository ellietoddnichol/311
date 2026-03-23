import React from 'react';
import { ArrowUpRight, Cloud, FileDown, FileText, Save, Send, Trash2 } from 'lucide-react';
import { ProjectRecord } from '../../shared/types/estimator';
import { formatCurrencySafe } from '../../utils/numberFormat';

interface Props {
  project: ProjectRecord;
  baseBidTotal: number;
  syncState: 'idle' | 'syncing' | 'ok' | 'error';
  lastSavedAt: string | null;
  onSave: () => Promise<void> | void;
  onPreviewProposal: () => void;
  onExport: () => void;
  onSubmitBid: () => Promise<void> | void;
  onDeleteProject: () => Promise<void> | void;
  statusActionLabel: string;
}

export function TopProjectHeader({
  project,
  baseBidTotal,
  syncState,
  lastSavedAt,
  onSave,
  onPreviewProposal,
  onExport,
  onSubmitBid,
  onDeleteProject,
  statusActionLabel,
}: Props) {
  const syncLabel = syncState === 'syncing' ? 'Syncing...' : syncState === 'ok' ? 'Synced' : syncState === 'error' ? 'Sync Error' : 'Not Synced';
  const syncColor = syncState === 'ok' ? 'text-emerald-700 bg-emerald-50 border-emerald-100' : syncState === 'error' ? 'text-red-700 bg-red-50 border-red-100' : 'text-slate-600 bg-slate-50 border-slate-200';

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(246,248,251,0.94)_100%)] px-4 py-1.5 backdrop-blur">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0 flex items-start gap-3">
          <div className="hidden h-7 w-1 rounded-full bg-[linear-gradient(180deg,var(--brand)_0%,var(--accent-teal)_100%)] md:block" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-[17px] font-semibold tracking-[-0.03em] text-slate-950 md:text-[19px]">{project.projectName}</p>
              <span className="ui-chip-soft">{project.status}</span>
              {project.projectNumber ? <span className="ui-chip-soft">#{project.projectNumber}</span> : null}
              <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-900">{formatCurrencySafe(baseBidTotal)}</span>
            </div>
            <p className="mt-0.5 text-[11px] text-slate-500 md:text-[12px]">
              {project.clientName || 'No client assigned'}
              {project.generalContractor ? ` · GC ${project.generalContractor}` : ''}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px]">
              <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${syncColor}`}> 
                <Cloud className="w-3.5 h-3.5" /> {syncLabel}
              </span>
              <span className="ui-chip-soft">Last saved {lastSavedAt ? new Date(lastSavedAt).toLocaleTimeString() : 'n/a'}</span>
              {project.estimator ? <span className="ui-chip-soft">Estimator {project.estimator}</span> : null}
            </div>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <div className="flex w-full flex-wrap items-center gap-2 md:w-auto md:justify-end">
            <div className="hidden md:flex items-center gap-1 rounded-full bg-white/75 p-1 shadow-sm ring-1 ring-slate-200/80 backdrop-blur">
              <button onClick={() => onSave()} className="flex h-7 items-center gap-1 rounded-full px-2.5 text-[10px] font-medium text-slate-700 hover:bg-slate-100">
            <Save className="w-3.5 h-3.5" /> Save
          </button>
              <button onClick={onPreviewProposal} className="flex h-7 items-center gap-1 rounded-full px-2.5 text-[10px] font-medium text-slate-700 hover:bg-slate-100">
            <FileText className="w-3.5 h-3.5" /> <span className="hidden lg:inline">Preview</span>
          </button>
              <button onClick={onExport} className="flex h-7 items-center gap-1 rounded-full px-2.5 text-[10px] font-medium text-slate-700 hover:bg-slate-100">
            <FileDown className="w-3.5 h-3.5" /> Export PDF
          </button>
            </div>
            <button onClick={() => onDeleteProject()} className="hidden md:inline-flex ui-ghost-btn items-center gap-1.5 text-[10px] text-red-700 hover:bg-red-50 hover:text-red-700">
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
            <button onClick={() => onSave()} className="flex h-7 items-center gap-1 rounded-full border border-slate-300 bg-white px-2.5 text-[10px] font-medium text-slate-700 hover:bg-slate-50 md:hidden">
              <Save className="w-3.5 h-3.5" /> Save
            </button>
            <button onClick={() => onSubmitBid()} className="flex h-8 items-center gap-1.5 rounded-full bg-[linear-gradient(135deg,var(--brand)_0%,var(--brand-strong)_72%)] px-3.5 text-[10px] font-semibold text-white shadow-[0_10px_24px_rgba(11,61,145,0.24)] hover:brightness-[1.03]">
              <Send className="w-3.5 h-3.5" /> {statusActionLabel}
              <ArrowUpRight className="w-3.5 h-3.5 opacity-80" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
