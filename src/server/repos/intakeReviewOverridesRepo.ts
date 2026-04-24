import { getEstimatorDb } from '../db/connection.ts';

export type IntakeReviewOverrideStatus = 'ignored';

export function upsertIntakeReviewOverride(input: { reviewLineFingerprint: string; status: IntakeReviewOverrideStatus }): void {
  const fp = String(input.reviewLineFingerprint || '').trim();
  const status = String(input.status || '').trim();
  if (!fp) return;
  if (status !== 'ignored') return;
  getEstimatorDb()
    .prepare(
      `INSERT INTO intake_review_overrides_v1 (review_line_fingerprint, status, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(review_line_fingerprint)
       DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at`
    )
    .run(fp, status, new Date().toISOString());
}

export function getIntakeReviewOverridesByFingerprints(fingerprints: string[]): Map<string, { status: IntakeReviewOverrideStatus; updatedAt: string }> {
  const fps = (fingerprints || []).map((f) => String(f || '').trim()).filter(Boolean);
  if (fps.length === 0) return new Map();
  const placeholders = fps.map(() => '?').join(', ');
  const rows = getEstimatorDb()
    .prepare(
      `SELECT review_line_fingerprint, status, updated_at
       FROM intake_review_overrides_v1
       WHERE review_line_fingerprint IN (${placeholders})`
    )
    .all(...fps) as Array<{ review_line_fingerprint: string; status: string; updated_at: string }>;
  const out = new Map<string, { status: IntakeReviewOverrideStatus; updatedAt: string }>();
  for (const r of rows) {
    if (r.status !== 'ignored') continue;
    out.set(r.review_line_fingerprint, { status: 'ignored', updatedAt: r.updated_at });
  }
  return out;
}

