import type { CatalogItem } from '../../../types.ts';
import type { StructuredModifierKey } from './structuredModifiers.ts';

export type InstallFamilyKey =
  | 'surface_mount_small_accessory'
  | 'surface_mount_medium_accessory'
  | 'recessed_accessory'
  | 'partition_compartment'
  | 'partition_component'
  | 'grab_bar'
  | 'wall_protection_lf'
  | 'wall_protection_sf'
  | 'locker_kd'
  | 'locker_accessory'
  | 'signage_small'
  | 'signage_directional'
  | 'entrance_mat_sf'
  | 'flagpole_exterior'
  | 'mailbox_4c'
  | 'projection_screen'
  | 'unknown';

export type LaborResolution = {
  installFamily: InstallFamilyKey;
  structuredModifiers: StructuredModifierKey[];
  laborMinutes: number;
  laborOrigin: 'catalog' | 'install_family_fallback';
  reviewFlags: string[];
};

const BASELINE_MINUTES: Record<InstallFamilyKey, number> = {
  surface_mount_small_accessory: 12,
  surface_mount_medium_accessory: 20,
  recessed_accessory: 35,
  partition_compartment: 120,
  partition_component: 30,
  grab_bar: 22,
  wall_protection_lf: 1.5, // minutes per LF (treated as per-unit in this estimator; review recommended)
  wall_protection_sf: 0.8, // minutes per SF
  locker_kd: 90,
  locker_accessory: 25,
  signage_small: 10,
  signage_directional: 18,
  entrance_mat_sf: 0.6,
  flagpole_exterior: 180,
  mailbox_4c: 240,
  projection_screen: 120,
  unknown: 0,
};

function n(text: string): string {
  return String(text || '').toLowerCase();
}

export function inferInstallFamily(input: {
  category?: string | null;
  description?: string | null;
  unit?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  catalogItem?: CatalogItem | null;
  structuredModifiers?: StructuredModifierKey[];
}): InstallFamilyKey {
  const cat = n(input.category || input.catalogItem?.category || '');
  const desc = n(input.description || input.catalogItem?.description || '');
  const unit = n(input.unit || input.catalogItem?.uom || '');
  const model = n(input.model || input.catalogItem?.model || '');
  const hay = `${cat} ${desc} ${model}`;

  if (/\bgrab bar\b/.test(hay) || /\bb[-\s]?6806\b/.test(hay) || /\bgb\b/.test(hay)) return 'grab_bar';
  if (/\bmailbox\b|\b4c\b/.test(hay)) return 'mailbox_4c';
  if (/\bflagpole\b/.test(hay)) return 'flagpole_exterior';
  if (/\bprojection screen\b|\bscreen\b/.test(hay) && /\bproject\b/.test(hay)) return 'projection_screen';
  if (/\bentrance mat\b|\bwalk[-\s]?off\b/.test(hay) && unit === 'sf') return 'entrance_mat_sf';
  if (/\bwall protection\b|\bcrash rail\b|\bchair rail\b|\bcorner guard\b/.test(hay) && unit === 'lf') return 'wall_protection_lf';
  if (/\bacrovyn\b|\bwall protection\b/.test(hay) && unit === 'sf') return 'wall_protection_sf';

  if (/\bpartition\b|\btoilet compartment\b|\bstall\b/.test(hay)) {
    if (/\bhardware\b|\bhinge\b|\bbracket\b/.test(hay)) return 'partition_component';
    return 'partition_compartment';
  }

  if (/\blocker\b/.test(hay)) {
    if (/\bkd\b|\bunassembled\b|\brta\b/.test(hay)) return 'locker_kd';
    if (/\bslope top\b|\bcoat hook\b|\bbench\b|\blocker bench\b/.test(hay)) return 'locker_accessory';
    return 'locker_kd';
  }

  if (/\bsign(age)?\b/.test(hay)) {
    if (/\bdirectional\b|\bwayfinding\b/.test(hay)) return 'signage_directional';
    return 'signage_small';
  }

  const installs = new Set(input.structuredModifiers || []);
  if (installs.has('recessed') || installs.has('semi_recessed')) return 'recessed_accessory';

  // Default accessories by vague category
  if (/\btoilet accessories\b|\bwashroom\b|\baccessor/.test(cat)) {
    return /\b(dispenser|mirror|dryer|hook)\b/.test(desc) ? 'surface_mount_medium_accessory' : 'surface_mount_small_accessory';
  }

  return 'unknown';
}

function isSuspiciousLaborMinutes(minutes: number): boolean {
  if (!Number.isFinite(minutes)) return true;
  if (minutes <= 0) return true;
  if (minutes > 600) return true;
  return false;
}

/**
 * Apply a minimal set of parametric modifier impacts to labor minutes.
 * This stays conservative: used only when labor fallback is used (or when explicitly opted-in later).
 */
export function applyStructuredModifierImpacts(baseMinutes: number, keys: StructuredModifierKey[]): { minutes: number; reviewFlags: string[] } {
  let minutes = baseMinutes;
  const flags: string[] = [];
  const set = new Set(keys);

  // Mounting impacts
  if (set.has('recessed')) {
    minutes += 10;
    minutes *= 1.08;
  } else if (set.has('semi_recessed')) {
    minutes += 6;
    minutes *= 1.04;
  }

  // Fire-rated: add a small adder, but avoid double-counting rough opening when recessed already applied
  if (set.has('fire_rated')) {
    const fireAdder = set.has('recessed') ? 4 : 8;
    minutes += fireAdder;
    if (set.has('recessed')) flags.push('recessed_plus_fire_rated_capped');
  }

  // Existing conditions: coordination labor (small) but do not stack with demo/remove automatically
  if (set.has('existing_conditions') && !set.has('demo_remove_existing')) {
    minutes += 6;
  }
  if (set.has('existing_conditions') && set.has('demo_remove_existing')) {
    flags.push('existing_conditions_demo_remove_nonstack');
  }

  // Heavy + lift: stack but cap and flag
  if (set.has('heavy_item')) minutes += 10;
  if (set.has('lift_required')) minutes += 12;
  if (set.has('heavy_item') && set.has('lift_required')) flags.push('heavy_plus_lift_review');
  if (minutes > baseMinutes * 2.2 && baseMinutes > 0) flags.push('modifier_labor_multiplier_high');

  return { minutes: Number(minutes.toFixed(2)), reviewFlags: Array.from(new Set(flags)) };
}

export function resolveLaborMinutesWithInstallFamily(input: {
  catalogLaborMinutes: number;
  installFamily: InstallFamilyKey;
  structuredModifiers: StructuredModifierKey[];
}): { laborMinutes: number; origin: LaborResolution['laborOrigin']; reviewFlags: string[] } {
  const base = Number(input.catalogLaborMinutes || 0);
  if (!isSuspiciousLaborMinutes(base)) {
    return { laborMinutes: base, origin: 'catalog', reviewFlags: [] };
  }
  const baseline = BASELINE_MINUTES[input.installFamily] ?? 0;
  const applied = applyStructuredModifierImpacts(baseline, input.structuredModifiers);
  const reviewFlags = [...applied.reviewFlags];
  if (input.installFamily === 'unknown') reviewFlags.push('insufficient_model_data');
  return { laborMinutes: applied.minutes, origin: 'install_family_fallback', reviewFlags };
}

