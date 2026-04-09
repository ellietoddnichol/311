import React from 'react';
import type { InstallReviewEmailDraft } from '../../shared/types/estimator';
import { formatCurrencySafe, formatNumberSafe } from '../../utils/numberFormat';

interface HandoffSummaryProps {
  draft: InstallReviewEmailDraft | null;
  generating: boolean;
  onGenerate: () => void;
  onCopy: () => void;
}

export function HandoffSummary({ draft, generating, onGenerate, onCopy }: HandoffSummaryProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={onGenerate}
          disabled={generating}
          className="inline-flex h-9 items-center justify-center rounded-full border border-slate-200 bg-white px-3.5 text-[11px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
        >
          {generating ? 'Generating...' : draft ? 'Regenerate' : 'Generate'}
        </button>
        <button
          type="button"
          onClick={onCopy}
          disabled={!draft}
          className="ui-btn-primary h-9 rounded-full px-3.5 text-[11px] font-semibold disabled:opacity-50"
        >
          Copy Email
        </button>
      </div>

      {draft ? (
        <div className="space-y-2.5">
          <div className="rounded-[14px] bg-slate-50 p-3 ring-1 ring-slate-200/80">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Subject</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{draft.subject}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-[14px] bg-slate-50 p-3 ring-1 ring-slate-200/80">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Location</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{draft.summary.location || 'Location TBD'}</p>
            </div>
            <div className="rounded-[14px] bg-slate-50 p-3 ring-1 ring-slate-200/80">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Timeline</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{draft.summary.timeline || 'Verify schedule with GC'}</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-[22px] bg-slate-50/80 p-3 ring-1 ring-slate-200/80">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Crew</p>
              <p className="mt-1 text-[22px] font-semibold tracking-[-0.04em] text-slate-950">{draft.summary.crewSize ?? 'TBD'}</p>
            </div>
            <div className="rounded-[22px] bg-slate-50/80 p-3 ring-1 ring-slate-200/80">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Hours</p>
              <p className="mt-1 text-[22px] font-semibold tracking-[-0.04em] text-slate-950">{formatNumberSafe(draft.summary.estimatedHours || 0, 1)}</p>
            </div>
            <div className="rounded-[22px] bg-slate-50/80 p-3 ring-1 ring-slate-200/80">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Days</p>
              <p className="mt-1 text-[22px] font-semibold tracking-[-0.04em] text-slate-950">{formatNumberSafe(draft.summary.estimatedDays || 0, 1)}</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-[22px] bg-slate-50/80 p-3 ring-1 ring-slate-200/80">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Material</p>
              <p className="mt-1 text-base font-semibold text-slate-900">{formatCurrencySafe(draft.summary.materialTotal || 0)}</p>
            </div>
            <div className="rounded-[22px] bg-slate-50/80 p-3 ring-1 ring-slate-200/80">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Labor</p>
              <p className="mt-1 text-base font-semibold text-slate-900">{formatCurrencySafe(draft.summary.laborTotal || 0)}</p>
            </div>
            <div className="rounded-[22px] bg-slate-50/80 p-3 ring-1 ring-slate-200/80">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Project modifiers</p>
              <p className="mt-1 text-base font-semibold text-slate-900">{draft.summary.projectConditions.length}</p>
            </div>
          </div>
          <div className="rounded-[14px] bg-white p-3 ring-1 ring-slate-200/80">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Body</p>
            <pre className="mt-2 max-h-[min(50vh,420px)] overflow-auto whitespace-pre-wrap text-xs text-slate-700">{draft.body}</pre>
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-600">Generate an internal handoff email for install crews. Nothing here is shown on the client proposal.</p>
      )}
    </div>
  );
}
