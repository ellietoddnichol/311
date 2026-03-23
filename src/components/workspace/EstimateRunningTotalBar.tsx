import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { EstimateSummary, TakeoffLineRecord } from '../../shared/types/estimator';
import { formatCurrencySafe } from '../../utils/numberFormat';

interface Props {
  summary: EstimateSummary | null;
  lines: TakeoffLineRecord[];
  currentViewLabel: string;
  currentViewTotal: number;
}

export function EstimateRunningTotalBar({ summary, lines, currentViewLabel, currentViewTotal }: Props) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const lineAddInsTotal = lines.reduce((sum, line) => {
    const materialDelta = (line.materialCost - line.baseMaterialCost) * line.qty;
    const laborDelta = (line.laborCost - line.baseLaborCost) * line.qty;
    return sum + materialDelta + laborDelta;
  }, 0);

  const addInsTotal = lineAddInsTotal + Number(summary?.conditionAdjustmentAmount || 0);
  const markupTotal = Number(summary?.overheadAmount || 0) + Number(summary?.profitAmount || 0);
  const overheadAmount = Number(summary?.overheadAmount || 0);
  const profitAmount = Number(summary?.profitAmount || 0);
  const material = Number(summary?.materialSubtotal || 0);
  const labor = Number(summary?.adjustedLaborSubtotal || summary?.laborSubtotal || 0);
  const cost = material + labor + addInsTotal;
  const sell = Number(summary?.baseBidTotal || 0);
  const margin = sell > 0 ? ((sell - cost) / sell) * 100 : 0;

  return (
    <div className="sticky bottom-0 z-20 mt-2 rounded-[18px] border-2 border-slate-200/90 bg-[linear-gradient(180deg,rgba(15,23,42,0.98)_0%,rgba(19,35,66,0.98)_100%)] px-8 py-4 text-white shadow-[0_10px_32px_rgba(15,23,42,0.22)] backdrop-blur" style={{fontSize:'1.25rem', minHeight: '64px'}}>
      <div className="grid grid-cols-1 md:grid-cols-[1.2fr_1fr_1fr_1fr_1fr_1fr_1fr_1fr] gap-x-6 gap-y-2 items-center text-[20px]">
        <div className="font-bold text-slate-100 text-[22px] col-span-2 md:col-span-1">{currentViewLabel}</div>
        <div className="flex flex-col items-start"><span className="text-slate-400 text-xs">Material</span><span className="font-bold text-white text-[22px]">{formatCurrencySafe(material)}</span></div>
        <div className="flex flex-col items-start"><span className="text-slate-400 text-xs">Labor</span><span className="font-bold text-white text-[22px]">{formatCurrencySafe(labor)}</span></div>
        <div className="flex flex-col items-start"><span className="text-slate-400 text-xs">Conditions</span><span className="font-bold text-white text-[22px]">{formatCurrencySafe(addInsTotal)}</span></div>
        <div className="flex flex-col items-start border-l border-white/15 pl-6"><span className="text-slate-400 text-xs">Cost</span><span className="font-bold text-white text-[22px]">{formatCurrencySafe(cost)}</span></div>
        <div className="flex flex-col items-start"><span className="text-slate-400 text-xs">Sell</span><span className="font-bold text-white text-[22px]">{formatCurrencySafe(sell)}</span></div>
        <div className="flex flex-col items-start"><span className="text-slate-400 text-xs">Margin</span><span className="font-bold text-white text-[22px]">{margin.toFixed(1)}%</span></div>
        <div className="flex flex-col items-start"><span className="text-slate-400 text-xs">View</span><span className="font-bold text-white text-[22px]">{formatCurrencySafe(currentViewTotal)}</span></div>
        <div className="col-span-full flex justify-end mt-2">
          <button
            type="button"
            onClick={() => setDetailsOpen((value) => !value)}
            className="inline-flex items-center gap-2 rounded-full border-2 border-white/20 bg-white/10 px-5 py-2 text-[16px] font-bold text-slate-100 transition hover:bg-white/20"
            style={{height:'48px'}}
          >
            Details
            {detailsOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </button>
        </div>
      </div>
      {detailsOpen ? (
        <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-2 border-t-2 border-white/15 pt-3 text-[16px] text-slate-300">
          <div className="flex flex-col items-start"><span className="text-slate-400 text-xs">Markup</span><span className="font-bold text-white text-[18px]">{formatCurrencySafe(markupTotal)}</span></div>
          <div className="flex flex-col items-start"><span className="text-slate-400 text-xs">Overhead</span><span className="font-bold text-white text-[18px]">{formatCurrencySafe(overheadAmount)}</span></div>
          <div className="flex flex-col items-start"><span className="text-slate-400 text-xs">Profit</span><span className="font-bold text-white text-[18px]">{formatCurrencySafe(profitAmount)}</span></div>
          <div className="flex flex-col items-start"><span className="text-slate-400 text-xs">Tax</span><span className="font-bold text-white text-[18px]">{formatCurrencySafe(summary?.taxAmount || 0)}</span></div>
        </div>
      ) : null}
    </div>
  );
}