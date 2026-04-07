import { EstimateSummary, ProjectRecord, TakeoffLineRecord } from '../../shared/types/estimator.ts';
import { formatNumberSafe, formatPercentSafe } from '../../utils/numberFormat.ts';
import { extendedLaborDollarsForLine } from '../../shared/utils/lineLaborExtension.ts';
import { computeProjectConditionEffects, normalizeProjectJobConditions } from '../../shared/utils/jobConditions.ts';
import { getConfiguredLaborRatePerHour } from '../repos/takeoffRepo.ts';

export function calculateEstimateSummary(project: ProjectRecord, lines: TakeoffLineRecord[]): EstimateSummary {
  const pricingMode = project.pricingMode || 'labor_and_material';
  const jobConditions = normalizeProjectJobConditions(project.jobConditions);
  const laborRatePerHour = getConfiguredLaborRatePerHour();

  const rawMaterialFull = lines.reduce((sum, line) => sum + line.materialCost * line.qty, 0);
  const wastePct = jobConditions.materialWastePercent;
  const materialAfterWaste = Number((rawMaterialFull * (1 + wastePct / 100)).toFixed(2));
  const wasteAllowanceAmount = Number((materialAfterWaste - rawMaterialFull).toFixed(2));
  const suppliesFlat = jobConditions.installerFieldSuppliesFlat;
  const suppliesPct = jobConditions.installerFieldSuppliesPercent;
  const suppliesFromPercent = Number(((materialAfterWaste * suppliesPct) / 100).toFixed(2));
  const installerFieldSuppliesAmount = Number((suppliesFlat + suppliesFromPercent).toFixed(2));
  const materialWithAllowances = Number((materialAfterWaste + installerFieldSuppliesAmount).toFixed(2));

  const learningPct = jobConditions.laborLearningCurvePercent;
  const learningMult = 1 + learningPct / 100;
  const laborCompanionRawBase = lines.reduce((sum, line) => sum + extendedLaborDollarsForLine(line, laborRatePerHour), 0);
  const laborCompanionRaw = Number((laborCompanionRawBase * learningMult).toFixed(2));
  const laborLearningCurveAllowanceAmount = Number((laborCompanionRaw - laborCompanionRawBase).toFixed(2));
  const rawLaborMinutesFullBase = lines.reduce(
    (sum, line) => sum + Number(line.laborMinutes || 0) * Number(line.qty || 0),
    0
  );
  const rawLaborMinutesScaled = Number((rawLaborMinutesFullBase * learningMult).toFixed(2));

  const materialForBid = pricingMode === 'labor_only' ? 0 : materialWithAllowances;
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

  const laborOHpct = Number(project.laborOverheadPercent ?? 0);
  const laborProfitpct = Number(project.laborProfitPercent ?? 0);

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

  const totalLaborMinutes = Number((rawLaborMinutesScaled * effects.laborHoursMultiplier).toFixed(2));
  const totalLaborHours = Number((totalLaborMinutes / 60).toFixed(2));
  const productivePerInstaller = Math.max(
    0.25,
    jobConditions.installerPaidDayHours - jobConditions.dailyBreakHoursPerInstaller
  );
  const productiveCrewHoursPerDay = Number((productivePerInstaller * Math.max(1, jobConditions.installerCount)).toFixed(2));
  const durationDays =
    totalLaborHours > 0 ? Math.max(1, Math.ceil(totalLaborHours / productiveCrewHoursPerDay)) : 0;

  const fieldAssumptions: string[] = [];
  if (pricingMode !== 'labor_only' && wastePct > 0) {
    fieldAssumptions.push(`Material waste allowance ${formatPercentSafe(wastePct)} applied to takeoff material.`);
  }
  if (pricingMode !== 'labor_only' && installerFieldSuppliesAmount > 0) {
    const parts: string[] = [];
    if (suppliesFlat > 0) parts.push(`$${suppliesFlat.toFixed(2)} flat`);
    if (suppliesPct > 0) parts.push(`${formatPercentSafe(suppliesPct)} of material after waste`);
    fieldAssumptions.push(`Installer field supplies (consumables) included: ${parts.join(' and ')}.`);
  }
  if (learningPct > 0) {
    fieldAssumptions.push(
      `Labor learning-curve allowance ${formatPercentSafe(learningPct)} applied to labor hours and labor dollars (before job multipliers).`
    );
  }
  if (jobConditions.dailyBreakHoursPerInstaller > 0) {
    fieldAssumptions.push(
      `Field schedule: ${formatNumberSafe(jobConditions.installerPaidDayHours, 1)} hr paid day − ${formatNumberSafe(jobConditions.dailyBreakHoursPerInstaller, 2)} hr breaks per installer → ${formatNumberSafe(productivePerInstaller, 2)} productive hr/installer/day (${formatNumberSafe(productiveCrewHoursPerDay, 2)} crew-hr/day).`
    );
  }

  return {
    materialSubtotal: materialForBid,
    laborSubtotal: laborCompanionRawBase,
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
    conditionAssumptions: [...effects.assumptions, ...fieldAssumptions],
    projectConditions: effects.projectConditions,
    productiveCrewHoursPerDay,
    materialWasteAllowanceAmount: pricingMode === 'labor_only' ? 0 : wasteAllowanceAmount,
    installerFieldSuppliesAmount: pricingMode === 'labor_only' ? 0 : installerFieldSuppliesAmount,
    laborLearningCurveAllowanceAmount,
  };
}
