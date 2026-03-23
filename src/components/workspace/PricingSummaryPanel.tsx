import React from 'react';
import { EstimateSummary } from '../../shared/types/estimator';
import { formatCurrencySafe, formatNumberSafe } from '../../utils/numberFormat';

interface Props {
  summary: EstimateSummary | null;
  scopeLabel: string;
  effectiveLaborRatePerHour: number;
}

export function PricingSummaryPanel({ summary, scopeLabel, effectiveLaborRatePerHour }: Props) {
  const material = Number(summary?.materialSubtotal || 0);
  const labor = Number(summary?.adjustedLaborSubtotal || summary?.laborSubtotal || 0);
  const conditions = Number(summary?.conditionAdjustmentAmount || 0);
  const cost = material + labor + conditions;
  const sell = Number(summary?.baseBidTotal || 0);
  const margin = sell > 0 ? ((sell - cost) / sell) * 100 : 0;

  return (
    <div className="space-y-2.5">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Summary</p>
        <p className="mt-1 text-[11px] text-slate-500">Financial validation for {scopeLabel}. Use this panel to sanity-check cost, sell, and assumptions before proposal output.</p>
      </div>

      <div className="rounded-[18px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(15,23,42,0.98)_0%,rgba(26,40,68,0.98)_100%)] p-3 text-white shadow-[0_16px_30px_rgba(15,23,42,0.18)]">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-300">Pricing Snapshot</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div className="rounded-[14px] bg-white/8 px-3 py-2 ring-1 ring-white/10">
            <p className="text-[10px] uppercase tracking-[0.12em] text-slate-300">Sell</p>
            <p className="mt-1 text-lg font-semibold">{formatCurrencySafe(sell)}</p>
          </div>
          <div className="rounded-[14px] bg-white/8 px-3 py-2 ring-1 ring-white/10">
            <p className="text-[10px] uppercase tracking-[0.12em] text-slate-300">Margin</p>
            <p className="mt-1 text-lg font-semibold">{formatNumberSafe(margin, 1)}%</p>
          </div>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-[18px] border border-slate-200 bg-white p-3 shadow-sm">
          <p className="text-[11px] font-semibold text-slate-900">Cost Stack</p>
          <div className="mt-2 space-y-1.5 text-[12px] text-slate-600">
            <div className="flex items-center justify-between"><span>Material</span><span className="font-semibold text-slate-900">{formatCurrencySafe(material)}</span></div>
            <div className="flex items-center justify-between"><span>Labor</span><span className="font-semibold text-slate-900">{formatCurrencySafe(labor)}</span></div>
            <div className="flex items-center justify-between"><span>Conditions</span><span className="font-semibold text-slate-900">{formatCurrencySafe(conditions)}</span></div>
            <div className="flex items-center justify-between border-t border-slate-100 pt-1.5"><span>Total Cost</span><span className="font-semibold text-slate-950">{formatCurrencySafe(cost)}</span></div>
          </div>
        </div>
        <div className="rounded-[18px] border border-slate-200 bg-white p-3 shadow-sm">
          <p className="text-[11px] font-semibold text-slate-900">Assumptions</p>
          <div className="mt-2 space-y-1.5 text-[12px] text-slate-600">
            <div className="flex items-center justify-between"><span>Effective labor rate</span><span className="font-semibold text-slate-900">{formatCurrencySafe(effectiveLaborRatePerHour)}/hr</span></div>
            <div className="flex items-center justify-between"><span>Labor hours</span><span className="font-semibold text-slate-900">{formatNumberSafe(summary?.totalLaborHours || 0, 2)}</span></div>
            <div className="flex items-center justify-between"><span>Assumptions</span><span className="font-semibold text-slate-900">{summary?.conditionAssumptions?.length || 0}</span></div>
          </div>
          {(summary?.conditionAssumptions?.length || 0) > 0 ? (
            <div className="mt-3 space-y-1.5 rounded-[14px] bg-slate-50 px-3 py-2">
              {summary?.conditionAssumptions.slice(0, 4).map((assumption) => (
                <p key={assumption} className="text-[10px] leading-5 text-slate-600">{assumption}</p>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}