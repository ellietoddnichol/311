import { ProjectJobConditions } from '../types/estimator';
import { formatNumberSafe } from '../../utils/numberFormat';
import { normalizeProjectJobConditions } from './jobConditions';

export const DEFAULT_WORK_DAY_HOURS = 8;
export const DEFAULT_WORK_WEEK_DAYS = 5;

export interface WorkDurationSummary {
  crewHoursPerDay: number;
  durationDays: number;
  durationWeeks: number;
}

export function calculateWorkDuration(
  totalLaborHours: number,
  jobConditions?: Partial<ProjectJobConditions> | null,
  workDayHours = DEFAULT_WORK_DAY_HOURS,
  workWeekDays = DEFAULT_WORK_WEEK_DAYS
): WorkDurationSummary {
  const normalizedJobConditions = normalizeProjectJobConditions(jobConditions);
  const normalizedTotalLaborHours = Number.isFinite(totalLaborHours) && totalLaborHours > 0 ? totalLaborHours : 0;
  const normalizedWorkDayHours = Number.isFinite(workDayHours) && workDayHours > 0 ? workDayHours : DEFAULT_WORK_DAY_HOURS;
  const normalizedWorkWeekDays = Number.isFinite(workWeekDays) && workWeekDays > 0 ? workWeekDays : DEFAULT_WORK_WEEK_DAYS;
  const crewHoursPerDay = Math.max(1, normalizedJobConditions.installerCount) * normalizedWorkDayHours;
  const durationDays = normalizedTotalLaborHours > 0
    ? Math.max(1, Math.ceil(normalizedTotalLaborHours / crewHoursPerDay))
    : 0;
  const durationWeeks = durationDays > 0
    ? Number((durationDays / normalizedWorkWeekDays).toFixed(2))
    : 0;

  return {
    crewHoursPerDay,
    durationDays,
    durationWeeks,
  };
}

export function formatWorkWeeksLabel(durationWeeks: number, fractionDigits = 1): string {
  const normalizedDurationWeeks = Number.isFinite(durationWeeks) && durationWeeks > 0 ? durationWeeks : 0;
  return `${formatNumberSafe(normalizedDurationWeeks, fractionDigits)} work week${normalizedDurationWeeks === 1 ? '' : 's'}`;
}