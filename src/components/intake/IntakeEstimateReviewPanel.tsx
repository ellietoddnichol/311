import React, { useMemo } from 'react';
import { ChevronDown } from 'lucide-react';
import type { ModifierRecord } from '../../shared/types/estimator';
import type {
  IntakeAiSuggestions,
  IntakeApplicationStatus,
  IntakeEstimateDraft,
  IntakeLineEstimateSuggestion,
  IntakeReviewLine,
  IntakeScopeBucket,
  IntakeSuggestedJobConditionPatch,
} from '../../shared/types/intake';
import type { CatalogItem } from '../../types';
import {
  applicationStatusLabel,
  computeDraftBasisSummary,
  ESTIMATE_REVIEW_HIGH_CONFIDENCE,
  ESTIMATE_REVIEW_LOW_SCORE_THRESHOLD,
  findAiClassificationForFingerprint,
  findReviewLineForFingerprint,
  getActiveCatalogMatchForRow,
  groupDraftLinesByScopeBucket,
  matchConfidenceTier,
  type DraftBasisSummary,
  type EstimateReviewLineState,
  scopeBucketLabel,
} from '../../shared/utils/intakeEstimateReview';
import { formatCurrencySafe, formatNumberSafe } from '../../utils/numberFormat';

function TierBadge({ tier }: { tier: 'high' | 'medium' | 'low' }) {
  const cls =
    tier === 'high'
      ? 'bg-emerald-100 text-emerald-900'
      : tier === 'medium'
        ? 'bg-amber-100 text-amber-950'
        : 'bg-slate-200 text-slate-800';
  const label = tier === 'high' ? 'High' : tier === 'medium' ? 'Medium' : 'Low';
  return (
    <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${cls}`}>{label}</span>
  );
}

function ScopeBadge({ bucket }: { bucket: IntakeScopeBucket }) {
  const muted =
    bucket === 'excluded_by_others' || bucket === 'informational_only'
      ? 'bg-violet-100 text-violet-900'
      : bucket === 'priced_base_scope'
        ? 'bg-sky-100 text-sky-900'
        : 'bg-slate-100 text-slate-700';
  return (
    <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${muted}`} title={bucket}>
      {scopeBucketLabel(bucket)}
    </span>
  );
}

function StatusBadge({ status }: { status: IntakeApplicationStatus }) {
  const cls =
    status === 'accepted'
      ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
      : status === 'replaced'
        ? 'bg-blue-50 text-blue-900 border-blue-200'
        : status === 'ignored'
          ? 'bg-slate-100 text-slate-600 border-slate-200'
          : 'bg-amber-50 text-amber-950 border-amber-200';
  return (
    <span className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold ${cls}`}>{applicationStatusLabel(status)}</span>
  );
}

export interface IntakeEstimateReviewPanelProps {
  draft: IntakeEstimateDraft;
  reviewLines: IntakeReviewLine[];
  aiSuggestions: IntakeAiSuggestions | null | undefined;
  modifiers: ModifierRecord[];
  lineByFingerprint: Record<string, EstimateReviewLineState>;
  onAcceptLine: (fingerprint: string) => void;
  onReplaceLineWithCatalogId: (fingerprint: string, catalogItemId: string) => void;
  onIgnoreLine: (fingerprint: string) => void;
  onBulkAcceptHighConfidence: () => void;
  onBulkIgnoreLowConfidence: () => void;
  onOpenCatalogPicker: (fingerprint: string) => void;
  jobConditionById: Record<string, IntakeApplicationStatus>;
  onSetJobConditionStatus: (id: string, status: IntakeApplicationStatus) => void;
  onApplyAllSuggestedJobConditions: () => void;
  projectModifierById: Record<string, IntakeApplicationStatus>;
  onSetProjectModifierStatus: (modifierId: string, status: IntakeApplicationStatus) => void;
  pricingModeDraft: string;
  onApplySuggestedPricingMode: () => void;
}

export function IntakeEstimateReviewPanel({
  draft,
  reviewLines,
  aiSuggestions,
  modifiers,
  lineByFingerprint,
  onAcceptLine,
  onReplaceLineWithCatalogId,
  onIgnoreLine,
  onBulkAcceptHighConfidence,
  onBulkIgnoreLowConfidence,
  onOpenCatalogPicker,
  jobConditionById,
  onSetJobConditionStatus,
  onApplyAllSuggestedJobConditions,
  projectModifierById,
  onSetProjectModifierStatus,
  pricingModeDraft,
  onApplySuggestedPricingMode,
}: IntakeEstimateReviewPanelProps) {
  const basisSummary: DraftBasisSummary = useMemo(
    () => computeDraftBasisSummary(draft, lineByFingerprint, aiSuggestions ?? null),
    [draft, lineByFingerprint, aiSuggestions]
  );

  const grouped = useMemo(() => groupDraftLinesByScopeBucket(draft.lineSuggestions), [draft.lineSuggestions]);

  const jobPatches: IntakeSuggestedJobConditionPatch[] = draft.projectSuggestion.suggestedJobConditionsPatch ?? [];

  const modifierLabel = useMemo(() => {
    const m = new Map<string, string>();
    for (const mod of modifiers) m.set(mod.id, mod.name);
    return m;
  }, [modifiers]);

  const projectModIds = draft.projectSuggestion.suggestedProjectModifierIds;

  function linePreviewText(fp: string): string {
    const rl = findReviewLineForFingerprint(fp, reviewLines);
    if (!rl) return '—';
    return (rl.description || rl.itemName || '').slice(0, 120) || '—';
  }

  function renderRow(row: IntakeLineEstimateSuggestion) {
    const fp = row.reviewLineFingerprint;
    const st = lineByFingerprint[fp] ?? {
      applicationStatus: row.applicationStatus,
      selectedCatalogItemId: row.suggestedCatalogItemId,
    };
    const match = getActiveCatalogMatchForRow(row, st);
    const tier = match ? matchConfidenceTier(match.confidence) : 'low';
    const aiRow = findAiClassificationForFingerprint(fp, reviewLines, aiSuggestions ?? null);
    const needs = row.scopeBucket === 'priced_base_scope' && st.applicationStatus === 'suggested';

    return (
      <tr key={fp} className="border-t border-slate-100 align-top text-[11px] text-slate-800">
        <td className="px-2 py-2">
          <div className="font-medium text-slate-900">{linePreviewText(fp)}</div>
          <div className="mt-0.5 font-mono text-[9px] text-slate-400" title={fp}>
            {fp.slice(0, 10)}…
          </div>
        </td>
        <td className="px-2 py-2">
          <ScopeBadge bucket={row.scopeBucket} />
        </td>
        <td className="px-2 py-2">
          <div className="capitalize text-slate-700">{aiRow?.pricingRole?.replace(/_/g, ' ') || '—'}</div>
          <div className="text-[10px] text-slate-500">Kind: {aiRow?.documentLineKind?.replace(/_/g, ' ') || '—'}</div>
        </td>
        <td className="px-2 py-2">
          {match ? (
            <>
              <TierBadge tier={tier} />
              <div className="mt-1 text-[10px] text-slate-600 tabular-nums">Score {formatNumberSafe(match.score, 3)}</div>
              <div className="mt-0.5 text-[10px] leading-snug text-slate-500">{match.reason}</div>
            </>
          ) : (
            <span className="text-amber-800">No match</span>
          )}
        </td>
        <td className="px-2 py-2">
          <div className="space-y-1">
            {row.topCatalogCandidates.slice(0, 3).map((c) => (
              <div key={c.catalogItemId} className={c.catalogItemId === st.selectedCatalogItemId ? 'font-semibold text-sky-900' : ''}>
                {c.sku} · {c.description.slice(0, 48)}
                {c.description.length > 48 ? '…' : ''}
              </div>
            ))}
            {row.topCatalogCandidates.length === 0 && <span className="text-slate-400">—</span>}
          </div>
        </td>
        <td className="px-2 py-2">
          <StatusBadge status={st.applicationStatus} />
          {needs ? <div className="mt-1 text-[9px] font-semibold uppercase text-amber-800">Needs review</div> : null}
        </td>
        <td className="px-2 py-2">
          <div className="flex flex-col gap-1">
            <button type="button" className="ui-btn-secondary h-7 px-2 text-[10px]" onClick={() => onAcceptLine(fp)}>
              Accept
            </button>
            <div className="flex flex-col gap-0.5">
              <select
                className="ui-input h-7 text-[10px]"
                value={st.selectedCatalogItemId || ''}
                onChange={(e) => {
                  const id = e.target.value;
                  if (id) onReplaceLineWithCatalogId(fp, id);
                }}
              >
                <option value="">Replace with…</option>
                {row.topCatalogCandidates.map((c) => (
                  <option key={c.catalogItemId} value={c.catalogItemId}>
                    {c.sku}
                  </option>
                ))}
              </select>
              <button type="button" className="ui-btn-secondary h-7 px-2 text-[10px]" onClick={() => onOpenCatalogPicker(fp)}>
                Search catalog…
              </button>
            </div>
            <button
              type="button"
              className="h-7 rounded border border-red-200 bg-white px-2 text-[10px] text-red-800 hover:bg-red-50"
              onClick={() => onIgnoreLine(fp)}
            >
              Ignore
            </button>
          </div>
        </td>
      </tr>
    );
  }

  function renderGroupedRows() {
    const blocks: React.ReactNode[] = [];
    for (const [bucket, rows] of grouped.entries()) {
      if (rows.length === 0) continue;
      const header =
        bucket === 'priced_base_scope' ? (
          <tr key={`h-${bucket}`} className="bg-sky-50/90">
            <td colSpan={7} className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-sky-950">
              {scopeBucketLabel(bucket)}
            </td>
          </tr>
        ) : (
          <tr key={`h-${bucket}`} className="bg-violet-50/80">
            <td colSpan={7} className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-violet-950">
              {scopeBucketLabel(bucket)} · not treated as standard priced takeoff unless you include below
            </td>
          </tr>
        );
      blocks.push(header);
      for (const row of rows) blocks.push(renderRow(row));
    }
    return blocks;
  }

  return (
    <div className="mt-4 space-y-3">
      <details className="group rounded-lg border border-slate-200 bg-white open:shadow-sm" open>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-600">Suggested matches</p>
            <p className="text-[11px] text-slate-600">Catalog candidates per parsed line — accept, replace, or ignore before creating the project.</p>
          </div>
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-500 transition group-open:rotate-180" />
        </summary>
        <div className="border-t border-slate-100 px-3 pb-3 pt-2">
          <div className="mb-2 flex flex-wrap gap-2">
            <button type="button" className="ui-btn-secondary h-8 px-3 text-[11px]" onClick={onBulkAcceptHighConfidence}>
              Accept all high-confidence ({ESTIMATE_REVIEW_HIGH_CONFIDENCE})
            </button>
            <button type="button" className="ui-btn-secondary h-8 px-3 text-[11px]" onClick={onBulkIgnoreLowConfidence}>
              Ignore low-confidence (score &lt; {ESTIMATE_REVIEW_LOW_SCORE_THRESHOLD} or {matchConfidenceTier('none')} match)
            </button>
          </div>
          <div className="max-h-[min(52vh,520px)] overflow-auto rounded border border-slate-200">
            <table className="w-full min-w-[720px] text-left">
              <thead className="sticky top-0 z-[1] bg-slate-100/95 text-[10px] uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-2 py-2">Line</th>
                  <th className="px-2 py-2">Scope</th>
                  <th className="px-2 py-2">AI hints</th>
                  <th className="px-2 py-2">Match</th>
                  <th className="px-2 py-2">Top 3</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>{renderGroupedRows()}</tbody>
            </table>
          </div>
        </div>
      </details>

      {jobPatches.length > 0 ? (
        <details className="group rounded-lg border border-slate-200 bg-white">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-600">Suggested job conditions</p>
              <p className="text-[11px] text-slate-600">Document-derived conditions — suggestion only until you accept.</p>
            </div>
            <ChevronDown className="h-4 w-4 shrink-0 text-slate-500 transition group-open:rotate-180" />
          </summary>
          <div className="space-y-2 border-t border-slate-100 px-3 pb-3 pt-2">
            <button type="button" className="ui-btn-secondary mb-2 h-8 px-3 text-[11px]" onClick={onApplyAllSuggestedJobConditions}>
              Apply all suggested job conditions to draft
            </button>
            {jobPatches.map((jc) => {
              const st = jobConditionById[jc.id] ?? jc.applicationStatus;
              return (
                <div key={jc.id} className="flex flex-wrap items-start justify-between gap-2 rounded border border-slate-100 bg-slate-50/80 p-2">
                  <div className="min-w-0 flex-1">
                    <label className="flex items-start gap-2 text-[11px]">
                      <input
                        type="checkbox"
                        checked={jc.suggestedState}
                        readOnly
                        className="mt-0.5"
                        aria-label="Suggested state"
                      />
                      <span>
                        <span className="font-semibold text-slate-900">{jc.label}</span>
                        {jc.reason ? <span className="mt-0.5 block text-slate-600">{jc.reason}</span> : null}
                      </span>
                    </label>
                    <div className="mt-1">
                      <StatusBadge status={st} />
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button type="button" className="ui-btn-secondary h-7 px-2 text-[10px]" onClick={() => onSetJobConditionStatus(jc.id, 'accepted')}>
                      Accept
                    </button>
                    <button type="button" className="h-7 rounded border border-slate-200 bg-white px-2 text-[10px]" onClick={() => onSetJobConditionStatus(jc.id, 'ignored')}>
                      Ignore
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </details>
      ) : null}

      {projectModIds.length > 0 ? (
        <details className="group rounded-lg border border-emerald-200/80 bg-emerald-50/20">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-900">Suggested project modifiers</p>
              <p className="text-[11px] text-emerald-950/80">Catalog modifiers (project scope) — not line-level pricing adders in this step.</p>
            </div>
            <ChevronDown className="h-4 w-4 shrink-0 text-emerald-800 transition group-open:rotate-180" />
          </summary>
          <div className="space-y-2 border-t border-emerald-100 px-3 pb-3 pt-2">
            {projectModIds.map((modId) => {
              const st = projectModifierById[modId] ?? 'suggested';
              const name = modifierLabel.get(modId) || modId;
              return (
                <div key={modId} className="flex flex-wrap items-center justify-between gap-2 rounded border border-emerald-100 bg-white p-2">
                  <div>
                    <p className="text-[11px] font-semibold text-slate-900">{name}</p>
                    <p className="text-[10px] text-slate-500">Source: matcher / catalog mapping</p>
                    <StatusBadge status={st} />
                  </div>
                  <div className="flex gap-1">
                    <button type="button" className="ui-btn-secondary h-7 px-2 text-[10px]" onClick={() => onSetProjectModifierStatus(modId, 'accepted')}>
                      Accept
                    </button>
                    <button type="button" className="h-7 rounded border border-slate-200 bg-white px-2 text-[10px]" onClick={() => onSetProjectModifierStatus(modId, 'ignored')}>
                      Ignore
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </details>
      ) : null}

      <details className="group rounded-lg border border-amber-200/80 bg-amber-50/15">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-950">Draft estimate basis</p>
            <p className="text-[11px] text-amber-950/90">
              Preliminary preview only — not final bid pricing or the full estimate engine.
            </p>
          </div>
          <ChevronDown className="h-4 w-4 shrink-0 text-amber-900 transition group-open:rotate-180" />
        </summary>
        <div className="space-y-2 border-t border-amber-100/80 px-3 pb-3 pt-2 text-[11px] text-slate-800">
          <ul className="grid gap-1 sm:grid-cols-2">
            <li>
              <span className="text-slate-500">Accepted priced lines:</span>{' '}
              <span className="font-semibold tabular-nums">{basisSummary.acceptedPricedLines}</span>
            </li>
            <li>
              <span className="text-slate-500">Needs review (priced scope):</span>{' '}
              <span className="font-semibold tabular-nums text-amber-900">{basisSummary.needsReviewPricedLines}</span>
            </li>
            <li>
              <span className="text-slate-500">Ignored lines:</span>{' '}
              <span className="font-semibold tabular-nums">{basisSummary.ignoredLines}</span>
            </li>
            <li>
              <span className="text-slate-500">Other scope buckets:</span>{' '}
              <span className="font-semibold tabular-nums">{basisSummary.otherScopeLines}</span>
            </li>
          </ul>
          <p>
            <span className="text-slate-500">Suggested pricing mode:</span>{' '}
            <span className="font-medium capitalize">{basisSummary.suggestedPricingModeLabel}</span>
            <span className="text-slate-400"> · </span>
            <span className="text-slate-500">Draft project mode:</span>{' '}
            <span className="font-medium capitalize">{pricingModeDraft.replace(/_/g, ' ') || '—'}</span>
          </p>
          {aiSuggestions?.pricingModeSuggested ? (
            <button type="button" className="ui-btn-secondary h-8 px-3 text-[11px]" onClick={onApplySuggestedPricingMode}>
              Apply suggested pricing mode to project draft
            </button>
          ) : null}
          <p>
            <span className="text-slate-500">Material subtotal preview (accepted/replaced priced lines only):</span>{' '}
            <span className="font-semibold tabular-nums">{formatCurrencySafe(basisSummary.materialSubtotalPreview)}</span>
          </p>
          <p>
            <span className="text-slate-500">Labor minutes preview (same basis):</span>{' '}
            <span className="font-semibold tabular-nums">{formatNumberSafe(basisSummary.laborMinutesSubtotalPreview, 1)}</span>
          </p>
          {basisSummary.warnings.length > 0 ? (
            <div className="rounded border border-amber-200 bg-amber-50/50 p-2">
              <p className="text-[10px] font-bold uppercase text-amber-950">Warnings</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[10px] text-amber-950">
                {basisSummary.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </details>
    </div>
  );
}
