import { EstimateSummary, ProjectRecord, TakeoffLineRecord } from '../../shared/types/estimator.ts';
import { extendedLaborDollarsForLine } from '../../shared/utils/lineLaborExtension.ts';
import { computeProjectConditionEffects, normalizeProjectJobConditions } from '../../shared/utils/jobConditions.ts';
import { getConfiguredLaborRatePerHour } from '../repos/takeoffRepo.ts';

export function calculateEstimateSummary(project: ProjectRecord, lines: TakeoffLineRecord[]): EstimateSummary {
  const pricingMode = project.pricingMode || 'labor_and_material';
  const jobConditions = normalizeProjectJobConditions(project.jobConditions);
  const laborRatePerHour = getConfiguredLaborRatePerHour();

  const rawMaterialFull = lines.reduce((sum, line) => sum + line.materialCost * line.qty, 0);
  const laborCompanionRaw = lines.reduce((sum, line) => sum + extendedLaborDollarsForLine(line, laborRatePerHour), 0);
  const rawLaborMinutesFull = lines.reduce(
    (sum, line) => sum + Number(line.laborMinutes || 0) * Number(line.qty || 0),
    0
  );

  const materialForBid = pricingMode === 'labor_only' ? 0 : rawMaterialFull;
  const laborForBidRaw = pricingMode === 'material_only' ? 0 : laborCompanionRaw;

  const effects = computeProjectConditionEffects(
    project,
    laborCompanionRaw,
    materialForBid,
    materialForBid + laborForBidRaw
  );

  const laborAdjustedCore = laborCompanionRaw + effects.laborAdjustmentAmount;
  const adjustedLaborForBid = pricingMode === 'material_only' ? 0 : laborAdjustedCore;

  const lineSubtotal = materialForBid + adjustedLaborForBid + effects.estimateAdderAmount;

  const laborOHpct = Number(project.laborOverheadPercent ?? project.overheadPercent ?? 0);
  const laborProfitpct = Number(project.laborProfitPercent ?? project.profitPercent ?? 0);

  const burdenAmount = Number((laborAdjustedCore * (project.laborBurdenPercent / 100)).toFixed(2));
  const afterBurden = laborAdjustedCore + burdenAmount;
  const laborOverheadAmount = Number((afterBurden * (laborOHpct / 100)).toFixed(2));
  const afterLaborOH = afterBurden + laborOverheadAmount;
  const laborProfitAmount = Number((afterLaborOH * (laborProfitpct / 100)).toFixed(2));
  const beforeSubFee = afterLaborOH + laborProfitAmount;
  const feePct = project.subLaborManagementFeeEnabled ? Number(project.subLaborManagementFeePercent || 0) : 0;
  const subLaborManagementFeeAmount = Number((beforeSubFee * (feePct / 100)).toFixed(2));
  const laborLoadedSubtotal = Number((beforeSubFee + subLaborManagementFeeAmount).toFixed(2));

  const taxAmount =
    materialForBid <= 0 ? 0 : Number((materialForBid * (effects.taxPercentApplied / 100)).toFixed(2));
  const materialAfterTax = materialForBid + taxAmount;
  const overheadAmount = Number((materialAfterTax * (project.overheadPercent / 100)).toFixed(2));
  const afterMaterialOH = materialAfterTax + overheadAmount;
  const profitAmount = Number((afterMaterialOH * (project.profitPercent / 100)).toFixed(2));
  const materialLoadedSubtotal = Number((afterMaterialOH + profitAmount).toFixed(2));

  const laborInMainBid = pricingMode !== 'material_only';
  const materialInMainBid = pricingMode !== 'labor_only';

  const baseBidTotal = Number(
    (
      (materialInMainBid ? materialLoadedSubtotal : 0) +
      (laborInMainBid ? laborLoadedSubtotal : 0) +
      effects.estimateAdderAmount
    ).toFixed(2)
  );

  const totalLaborMinutes = Number((rawLaborMinutesFull * effects.laborHoursMultiplier).toFixed(2));
  const totalLaborHours = Number((totalLaborMinutes / 60).toFixed(2));
  const crewHoursPerDay = Math.max(1, jobConditions.installerCount) * 8;
  const durationDays = totalLaborHours > 0 ? Math.max(1, Math.ceil(totalLaborHours / crewHoursPerDay)) : 0;

  return {
    materialSubtotal: materialForBid,
    laborSubtotal: laborCompanionRaw,
    adjustedLaborSubtotal: adjustedLaborForBid,
    totalLaborMinutes,
    totalLaborHours,
    durationDays,
    lineSubtotal,
    conditionAdjustmentAmount: effects.totalConditionAdjustment,
    conditionLaborMultiplier: effects.laborCostMultiplier,
    conditionLaborHoursMultiplier: effects.laborHoursMultiplier,
    burdenAmount,
    overheadAmount,
    profitAmount,
    taxAmount,
    laborOverheadAmount,
    laborProfitAmount,
    subLaborManagementFeeAmount,
    materialLoadedSubtotal,
    laborLoadedSubtotal,
    laborCompanionProposalTotal: laborLoadedSubtotal,
    baseBidTotal,
    conditionAssumptions: effects.assumptions,
    projectConditions: effects.projectConditions,
  };
}
