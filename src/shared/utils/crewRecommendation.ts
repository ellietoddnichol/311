import type { CrewRecommendationResult, ProjectJobConditions, TakeoffLineRecord } from '../types/estimator';

const HEAVY_TWO_PERSON_RE =
  /partition|locker|operable\s+wall|panel\s+system|toilet\s+partition|bathroom\s+partition|visual\s+display|whiteboard\s+wall|glass\s+board|marker\s?wall/i;

function ceilDays(laborHours: number, crew: number, hoursPerInstallerDay: number): number {
  if (laborHours <= 0 || crew < 1) return 0;
  const crewHoursPerDay = hoursPerInstallerDay * crew;
  return Math.max(1, Math.ceil(laborHours / crewHoursPerDay));
}

function uniqueRoomCount(lines: TakeoffLineRecord[]): number {
  const ids = new Set<string>();
  for (const line of lines) {
    const id = String(line.roomId || '').trim();
    if (id) ids.add(id);
  }
  return ids.size;
}

function totalQty(lines: TakeoffLineRecord[]): number {
  return lines.reduce((s, line) => s + Number(line.qty || 0), 0);
}

function scopeNeedsTwoPersonMin(lines: TakeoffLineRecord[]): boolean {
  for (const line of lines) {
    const text = `${line.description || ''} ${line.category || ''} ${line.subcategory || ''}`;
    if (HEAVY_TWO_PERSON_RE.test(text)) return true;
  }
  return false;
}

function baseRecommendedFromHours(hours: number): number {
  if (hours < 40) return 1;
  if (hours < 120) return 1;
  if (hours < 240) return 2;
  if (hours < 400) return 3;
  return 4;
}

function distributedScopeBump(rooms: number, hours: number, current: number): number {
  let r = current;
  if (rooms >= 10 && hours >= 60) r = Math.max(r, 2);
  if (rooms >= 20 && hours >= 120) r = Math.max(r, 3);
  return r;
}

function complexityTier(linesCount: number, rooms: number, qty: number): 'small' | 'medium' | 'large' {
  let score = 0;
  if (linesCount >= 80) score += 2;
  else if (linesCount >= 40) score += 1;
  if (rooms >= 20) score += 2;
  else if (rooms >= 10) score += 1;
  if (qty >= 150) score += 2;
  else if (qty >= 80) score += 1;
  if (score >= 4) return 'large';
  if (score >= 2) return 'medium';
  return 'small';
}

function targetMaxFieldDays(tier: 'small' | 'medium' | 'large'): number {
  if (tier === 'small') return 8;
  if (tier === 'medium') return 12;
  return 15;
}

function maxEfficientCrewCap(job: ProjectJobConditions): number {
  if (job.occupiedBuilding && job.phasedWork) return 3;
  if (job.restrictedAccess && job.occupiedBuilding) return 4;
  return 6;
}

/**
 * Schedule-oriented crew suggestion. Does not change labor dollars — only explains staffing vs duration.
 */
export function computeCrewRecommendation(
  totalLaborHours: number,
  lines: TakeoffLineRecord[],
  jobConditions: ProjectJobConditions,
  hoursPerInstallerDay = 8
): CrewRecommendationResult {
  const roomCount = uniqueRoomCount(lines);
  const linesCount = lines.length;
  const qty = totalQty(lines);
  const manualCrew = Math.max(1, Number(jobConditions.installerCount) || 1);

  const reasoning: string[] = [];

  let minimumCrew = 1;
  if (scopeNeedsTwoPersonMin(lines)) {
    minimumCrew = 2;
    reasoning.push('Scope includes items that typically need two installers (e.g. partitions, lockers, large panel systems).');
  }

  let recommendedCrew = baseRecommendedFromHours(totalLaborHours);
  if (totalLaborHours >= 40 && totalLaborHours < 120 && roomCount >= 8) {
    recommendedCrew = Math.max(recommendedCrew, 2);
    reasoning.push('Moderate hours with several rooms — a second installer often shortens calendar time.');
  }

  recommendedCrew = distributedScopeBump(roomCount, totalLaborHours, recommendedCrew);
  if (roomCount >= 10 && totalLaborHours >= 60) {
    reasoning.push('Work is spread across many rooms and can often be parallelized.');
  }

  if (jobConditions.floors > 1) {
    recommendedCrew = Math.max(recommendedCrew, 2);
    reasoning.push('Multiple floors usually benefit from more than one installer for mobilization and parallel work.');
  }
  if (jobConditions.scheduleCompression || jobConditions.nightWork) {
    recommendedCrew = Math.min(6, recommendedCrew + 1);
    reasoning.push('Compressed schedule or night work suggests adding crew where the site allows.');
  }
  if (jobConditions.remoteTravel) {
    recommendedCrew = Math.min(6, Math.max(recommendedCrew, 2));
    reasoning.push('Remote travel often favors a slightly larger crew to reduce total days on site.');
  }

  recommendedCrew = Math.max(recommendedCrew, minimumCrew);

  const tier = complexityTier(linesCount, roomCount, qty);
  const targetDays = targetMaxFieldDays(tier);
  const maxEfficientCrew = maxEfficientCrewCap(jobConditions);

  if (jobConditions.occupiedBuilding && jobConditions.phasedWork) {
    reasoning.push('Occupied, phased work may limit how many installers are effective in one area at a time.');
  }

  let guard = 0;
  while (
    guard < 8 &&
    recommendedCrew < maxEfficientCrew &&
    totalLaborHours > 0 &&
    ceilDays(totalLaborHours, recommendedCrew, hoursPerInstallerDay) > targetDays
  ) {
    recommendedCrew += 1;
    guard += 1;
  }
  if (guard > 0) {
    reasoning.push(
      `Adjusted recommended crew so field duration stays near a practical range (~${targetDays} working days or fewer for this project size).`
    );
  }

  recommendedCrew = Math.min(recommendedCrew, maxEfficientCrew);
  recommendedCrew = Math.max(recommendedCrew, minimumCrew);

  const daysAtMinCrew = ceilDays(totalLaborHours, minimumCrew, hoursPerInstallerDay);
  const daysAtRecommendedCrew = ceilDays(totalLaborHours, recommendedCrew, hoursPerInstallerDay);
  const daysAtManualCrew = ceilDays(totalLaborHours, manualCrew, hoursPerInstallerDay);

  let durationWarning: string | null = null;
  if (manualCrew < recommendedCrew && daysAtManualCrew > targetDays && totalLaborHours >= 40) {
    durationWarning = `Manual crew (${manualCrew}) projects to about ${daysAtManualCrew} field days vs ~${daysAtRecommendedCrew} days with a recommended ${recommendedCrew}-person crew.`;
  } else if (manualCrew === 1 && recommendedCrew >= 2 && daysAtManualCrew >= 12 && totalLaborHours >= 60) {
    durationWarning = `A single installer would need about ${daysAtManualCrew} field days; consider at least ${recommendedCrew} installers for a more typical schedule.`;
  }

  let confidence: CrewRecommendationResult['confidence'] = 'medium';
  if (linesCount === 0 || totalLaborHours <= 0) confidence = 'low';
  else if (reasoning.length >= 2 && Math.abs(recommendedCrew - manualCrew) <= 1) confidence = 'high';

  if (linesCount > 0 && reasoning.length === 0) {
    reasoning.push('Based on total install hours, room spread, and line count.');
  }

  return {
    minimumCrew,
    recommendedCrew,
    maxEfficientCrew,
    confidence,
    reasoning,
    daysAtMinCrew,
    daysAtRecommendedCrew,
    daysAtManualCrew,
    durationWarning,
    targetMaxFieldDays: targetDays,
    complexityTier: tier,
  };
}
