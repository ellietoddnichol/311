import React from 'react';
import type { InstallReviewEmailDraft } from '../../shared/types/estimator';
import type { WorkspaceTab } from '../../shared/types/projectWorkflow';
import { HandoffSummary } from '../../components/workflow/HandoffSummary';

interface HandoffPageProps {
  setActiveTab: (tab: WorkspaceTab) => void;
  installReviewDraft: InstallReviewEmailDraft | null;
  installReviewGenerating: boolean;
  onGenerateInstallReview: () => void;
  onCopyInstallReview: () => void;
}

export function HandoffPage({
  setActiveTab,
  installReviewDraft,
  installReviewGenerating,
  onGenerateInstallReview,
  onCopyInstallReview,
}: HandoffPageProps) {
  return (
    <div className="mx-auto max-w-[900px] space-y-6">
      <header className="rounded-2xl border border-slate-200/80 bg-white px-5 py-5 shadow-sm">
        <p className="ui-label">Internal</p>
        <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">Install handoff</h2>
        <p className="mt-2 text-sm text-slate-600">
          Crew-facing summary and email draft — not shown on the client proposal. Same generator as before, on its own step for clarity.
        </p>
        <button type="button" onClick={() => setActiveTab('proposal')} className="ui-btn-secondary mt-4 h-9 rounded-full px-4 text-[11px] font-semibold">
          Client proposal
        </button>
      </header>
      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
        <HandoffSummary
          draft={installReviewDraft}
          generating={installReviewGenerating}
          onGenerate={onGenerateInstallReview}
          onCopy={onCopyInstallReview}
        />
      </section>
    </div>
  );
}
