import React from 'react';
import type { CrewRecommendationResult } from '../../shared/types/estimator';
import { formatNumberSafe } from '../../utils/numberFormat';

interface CrewRecommendationCardProps {
  crew: CrewRecommendationResult | undefined;
  manualInstallerCount: number;
  className?: string;
}

export function CrewRecommendationCard({ crew, manualInstallerCount, className = '' }: CrewRecommendationCardProps) {
  if (!crew) {
    return (
      <div className={`rounded-2xl border border-slate-200/80 bg-slate-50/80 p-3.5 text-sm text-slate-600 ${className}`}>
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Crew recommendation</p>
        <p className="mt-2 text-xs">Add estimate lines to see staffing guidance.</p>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border border-slate-200/80 bg-white/92 p-3.5 shadow-sm ${className}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Crew recommendation</p>
      <p className="mt-1 text-[11px] text-slate-600">Schedule-focused; labor dollars still follow total hours in this estimate.</p>

      <dl className="mt-3 grid gap-2 text-xs">
        <div className="flex justify-between gap-3">
          <dt className="text-slate-600">Minimum</dt>
          <dd className="font-bold tabular-nums text-slate-900">{crew.minimumCrew}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-slate-600">Recommended</dt>
          <dd className="font-bold tabular-nums text-slate-900">{crew.recommendedCrew}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-slate-600">Days at recommended</dt>
          <dd className="font-semibold tabular-nums text-slate-900">~{formatNumberSafe(crew.daysAtRecommendedCrew, 0)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-slate-600">Days at manual crew ({manualInstallerCount})</dt>
          <dd className="font-semibold tabular-nums text-slate-900">~{formatNumberSafe(crew.daysAtManualCrew, 0)}</dd>
        </div>
      </dl>

      <p className="mt-2 text-[11px] capitalize text-slate-500">
        Confidence: <span className="font-semibold text-slate-700">{crew.confidence}</span>
      </p>

      {crew.reasoning.length > 0 ? (
        <ul className="mt-2 list-disc space-y-1 pl-4 text-[11px] leading-snug text-slate-600">
          {crew.reasoning.slice(0, 6).map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      ) : null}

      {manualInstallerCount !== crew.recommendedCrew ? (
        <p className="mt-2 text-[11px] font-medium text-slate-700">
          Installers in Setup: <span className="tabular-nums">{manualInstallerCount}</span>
        </p>
      ) : null}

      {crew.durationWarning ? (
        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] leading-snug text-amber-950">
          {crew.durationWarning}
        </p>
      ) : null}
    </div>
  );
}
