import fs from 'fs';

export type PgSslConfig = false | { ca?: string; rejectUnauthorized?: boolean };

/**
 * Optional SSL configuration for Postgres/Supabase.
 *
 * - Set `PG_SSL_CA_PATH` to a PEM/CRT file (e.g. Supabase `prod-ca-2021.crt`)
 * - Optionally set `PG_SSL_REJECT_UNAUTHORIZED=0` to disable verification (not recommended)
 */
export function resolvePgSslConfig(): PgSslConfig {
  const caPath = String(process.env.PG_SSL_CA_PATH || '').trim();
  if (!caPath) return false;
  const rejectUnauthorized = !['0', 'false', 'no'].includes(String(process.env.PG_SSL_REJECT_UNAUTHORIZED || '').trim().toLowerCase());
  const ca = fs.readFileSync(caPath, 'utf8');
  return { ca, rejectUnauthorized };
}

