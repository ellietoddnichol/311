import React from 'react';
import type { WorkspaceTab } from '../../shared/types/projectWorkflow';

export interface WorkflowTabItem {
  id: WorkspaceTab;
  label: string;
  badge?: number;
  title?: string;
}

interface WorkflowTabsProps {
  tabs: WorkflowTabItem[];
  active: WorkspaceTab;
  onChange: (tab: WorkspaceTab) => void;
  trailing?: React.ReactNode;
}

export function WorkflowTabs({ tabs, active, onChange, trailing }: WorkflowTabsProps) {
  return (
    <div className="ui-surface flex items-center gap-1 overflow-x-auto whitespace-nowrap p-1.5 shadow-sm">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          title={t.title}
          onClick={() => onChange(t.id)}
          className={`ui-wtab inline-flex items-center gap-1.5 ${active === t.id ? 'ui-wtab-blue' : 'ui-wtab-idle'}`}
        >
          <span>{t.label}</span>
          {t.badge != null && t.badge > 0 ? (
            <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-amber-950">{t.badge}</span>
          ) : null}
        </button>
      ))}
      {trailing ? <div className="ml-auto flex shrink-0 items-center gap-1.5 pl-2">{trailing}</div> : null}
    </div>
  );
}
