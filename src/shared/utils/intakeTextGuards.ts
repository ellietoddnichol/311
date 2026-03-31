/** Strip C0/C1 controls except tab/LF/CR/form-feed (keep PDF page breaks and line structure). */
const INTAKE_CTRL_CHARS = /[\u0000-\u0008\u000B\u000E-\u001F\u007F-\u009F\u200B-\u200F\uFEFF\uFFFD]/g;

/** Remove unsafe control chars only — do not collapse newlines or form-feed (Excel/PDF rely on them). */
export function stripIntakeControlCharacters(text: string): string {
  return String(text || '').replace(INTAKE_CTRL_CHARS, ' ');
}

function intakeTrim(value: unknown): string {
  return String(value ?? '').trim();
}

/** Common when PDF bytes are mis-decoded as Latin-1 (vulgar fractions, superscripts). */
const MOJIBAKE_LATIN_SYMBOLS = /[\u00BC\u00BD\u00BE\u00B9\u00B2\u00B3]/;

function longestAsciiLetterRun(text: string): number {
  const runs = text.match(/[A-Za-z]+/g);
  if (!runs?.length) return 0;
  return Math.max(...runs.map((run) => run.length));
}

/**
 * Reject PDF mojibake / binary soup masquerading as a title (common with Latin-1 buffer dumps).
 * Favors readable Latin job names; allows a Unicode fallback when the title is clearly letter-based.
 */
export function isPlausibleProjectTitle(value: string): boolean {
  const raw = String(value || '');
  if (raw.includes('\uFFFD')) return false;

  const t = intakeTrim(stripIntakeControlCharacters(raw)).replace(/\s+/g, ' ').trim();
  if (t.length < 2 || t.length > 180) return false;

  const nonSpace = t.replace(/\s/g, '');
  if (nonSpace.length < 2) return false;

  let suspicious = 0;
  for (const ch of nonSpace) {
    if (/[A-Za-z0-9]/.test(ch)) continue;
    if ('.,;:\'’"&/@#+\\=()%-–—_'.includes(ch)) continue;
    if (/[\u00C0-\u024F]/.test(ch)) continue;
    suspicious += 1;
  }
  const suspiciousRatio = suspicious / nonSpace.length;
  if (suspiciousRatio > 0.18) return false;

  let asciiSafe = 0;
  for (const ch of nonSpace) {
    if (/[A-Za-z0-9]/.test(ch)) asciiSafe += 1;
  }
  const asciiRatio = asciiSafe / nonSpace.length;
  const asciiLetterRun = longestAsciiLetterRun(t);

  if (asciiRatio < 0.52 && asciiLetterRun < 5) return false;

  if (MOJIBAKE_LATIN_SYMBOLS.test(nonSpace) && (asciiRatio < 0.55 || !/[A-Za-z]{5,}/.test(t))) {
    return false;
  }

  if (MOJIBAKE_LATIN_SYMBOLS.test(nonSpace) && asciiLetterRun < 6) return false;

  if (asciiRatio >= 0.48) {
    const letterWords = t.match(/[A-Za-z]{2,}/g) || [];
    const compactJobCode = /[A-Za-z]\s*[-–#]\s*\d{1,8}\b/.test(t) && t.length <= 36;
    if (letterWords.length < 1 && !compactJobCode) return false;
    return true;
  }

  const letterish = [...nonSpace].filter((ch) => /\p{L}|\p{N}/u.test(ch)).length;
  if (letterish / nonSpace.length < 0.55) return false;
  if (!/\p{L}{3,}/u.test(t)) return false;
  return true;
}

/**
 * PDF text extraction often yields operator tokens, mojibake, or dictionary crumbs as separate "lines".
 * Skip those so they are not imported as hundreds of fake scope rows.
 */
export function looksLikePdfExtractionNoiseLine(text: string): boolean {
  const t = intakeTrim(stripIntakeControlCharacters(String(text || ''))).replace(/\s+/g, ' ').trim();
  if (!t) return true;

  const lower = t.toLowerCase();
  const toks = t.split(/\s+/).filter(Boolean);

  const trimmedPipe = t.trim();
  if (trimmedPipe.startsWith('|') && trimmedPipe.endsWith('|') && trimmedPipe.length <= 300) {
    return true;
  }

  const compact = t.replace(/\s+/g, '');
  if (compact.length <= 72 && /^\|[a-z0-9]{1,28}\|$/i.test(compact)) return true;
  if (compact.length <= 96 && /^\/[a-z][a-z0-9]{0,23}$/i.test(compact)) return true;

  // PDF structure / graphics operators leaked into visible text (common with Word → PDF).
  if (t.length <= 200 && /\b(endobj|startxref|endstream|extgstate|textstate|colorspace|pattern|shading)\b/i.test(t)) {
    return true;
  }
  if (t.length <= 120 && /^\s*xref\s*[\d\s]+$/i.test(t.trim())) return true;
  if (t.length < 110 && /\bgs\d+\b/i.test(t)) return true;

  if (/\|/.test(t)) {
    if (/\badobe\b/.test(lower)) return true;
    if (t.length < 160 && /\b(creator|producer|creationdate|moddate|keywords)\b/.test(lower)) return true;
    const pipeCount = (t.match(/\|/g) || []).length;
    if (pipeCount >= 3 && t.length < 220) return true;
  }

  // Producer metadata with spaced-out letters: "m i c r o s o f t w o r d"
  if (toks.length >= 12) {
    const singles = toks.filter((x) => x.length === 1).length;
    if (singles / toks.length >= 0.45) return true;
  }
  // Operator soup: q f 6, 6 lt qa f — short tokens, no real English/product word (5+ letters).
  if (
    toks.length >= 4 &&
    toks.length <= 36 &&
    t.length < 140 &&
    !/\b[a-z]{5,}\b/i.test(t)
  ) {
    const shortToks = toks.filter((x) => x.length <= 2).length;
    if (shortToks / toks.length >= 0.65) return true;
  }

  if (/^(endobj|startxref|xref|trailer|stream)$/i.test(lower)) return true;
  if (/\badobe\b/i.test(lower) && compact.length < 80 && /\|/.test(t)) return true;

  const nonSpace = t.replace(/\s/g, '');
  if (nonSpace.length < 4) return true;

  let suspicious = 0;
  for (const ch of nonSpace) {
    if (/[A-Za-z0-9]/.test(ch)) continue;
    if ('.,;:\'’"&/@#+\\=()%-–—_*×°•·'.includes(ch)) continue;
    if (/[\u00C0-\u024F]/.test(ch)) continue;
    suspicious += 1;
  }
  const asciiRatio = [...nonSpace].filter((ch) => /[A-Za-z0-9]/.test(ch)).length / nonSpace.length;
  if (suspicious / nonSpace.length > 0.32) return true;
  if (asciiRatio < 0.22 && nonSpace.length > 10) return true;
  if (MOJIBAKE_LATIN_SYMBOLS.test(nonSpace) && asciiRatio < 0.5) return true;
  if (!/[A-Za-z]{2,}/.test(t) && nonSpace.length < 56) return true;
  return false;
}

/**
 * Letterhead / cover-block lines from subcontractor proposals (Word → PDF).
 * Keeps qty-led scope rows like "2 963 baby change station" while dropping company blocks.
 */
export function looksLikePdfProposalBoilerplateLine(text: string): boolean {
  const t = intakeTrim(stripIntakeControlCharacters(String(text || ''))).replace(/\s+/g, ' ').trim();
  if (!t) return true;
  const lower = t.toLowerCase();

  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(t)) return true;
  if (/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/.test(t)) return true;

  if (/^(project|proposal date|plans dated|addendums)\s*:/i.test(t)) return true;
  if (/^to secure pricing\b/i.test(t)) return true;
  if (/^within\s+\d+\s+days\b/i.test(t) && t.length < 100) return true;
  if (/proposal date|approved submittals/i.test(t) && t.length < 90) return true;

  if (t.length <= 90 && /^(\d{4,6})\s+(\d{2,4})\s*$/i.test(t.replace(/\s+/g, ' ').trim())) return true;

  const collapsed = t.replace(/\s+/g, ' ').trim();
  if (/^quantity'?s?\b/i.test(collapsed) && collapsed.length < 72 && !/\d/.test(collapsed)) return true;
  if (/^material\b/i.test(collapsed) && collapsed.length < 72 && !/\d/.test(collapsed)) return true;

  if (t.length <= 100 && /^[A-Z0-9][A-Za-z0-9\s,&'.-]+\s+(Inc\.?|LLC|L\.L\.C\.|Corp\.?|Ltd\.?)\s*$/i.test(t)) {
    return true;
  }

  if (/\b[A-Za-z\s]+,\s*[A-Z]{2}\b.*\b\d{5}(-\d{4})?\s*$/i.test(t) && t.length < 130) return true;
  if (t.length <= 120 && /[A-Za-z][A-Za-z\s]+,\s*\d{5}\s*$/i.test(t)) return true;

  if (/^(street|st|ave|avenue|road|rd|blvd|boulevard|drive|dr|ln|lane)\b\.?$/i.test(t)) return true;
  if (/^(nd|th|rd)\b$/i.test(lower) && t.length <= 4) return true;

  if (/^prepared by\b/i.test(t) && t.length < 80) return true;
  if (/^submitted by\b/i.test(t) && t.length < 80) return true;

  if (!/^\d/.test(t) && t.length <= 72 && /\bacc\.?\s*$/i.test(t)) return true;

  return false;
}

const HEADER_RIBBON_TOKENS = new Set([
  'item',
  'name',
  'qty',
  'quantity',
  'description',
  'unit',
  'uom',
  'room',
  'location',
  'area',
  'manufacturer',
  'mfr',
  'model',
  'finish',
  'notes',
  'price',
  'total',
  'cost',
  'ext',
  'extended',
  'no',
  'number',
  'code',
  'type',
  'cat',
  'category',
]);

/**
 * Section titles, spec callouts, and echoed spreadsheet column headers — not billable scope lines.
 * Dropped at validation so they are not catalog-matched or shown as review items.
 */
export function looksLikeIntakeSectionHeaderOrTitleLine(text: string): boolean {
  const t = intakeTrim(stripIntakeControlCharacters(String(text || ''))).replace(/\s+/g, ' ').trim();
  if (!t || t.length > 140) return false;
  const lower = t.toLowerCase();

  if (
    /^(item(\s+(name|description|code|number|no\.?))?|qty\.?|quantity|description|location|room|area|unit|uom|manufacturer|mfr\.?|model|finish|notes|total|subtotal|price|cost|ext\.?\s*price|extended\s+price|linetype|layer|header)$/i.test(
      t
    ) &&
    t.length < 52
  ) {
    return true;
  }

  const words = lower.split(/\s+/).filter(Boolean);
  if (words.length >= 2 && words.length <= 14) {
    const stripped = words.map((w) => w.replace(/[^a-z]/g, '')).filter(Boolean);
    if (stripped.length === words.length && stripped.every((w) => HEADER_RIBBON_TOKENS.has(w))) return true;
  }

  const divMatch = /^division\s*\d{1,2}\b\s*(?:[-–—]\s*)?(.*)$/i.exec(t);
  if (divMatch) {
    const rest = (divMatch[1] || '').trim();
    if (!rest) return true;
    if (!/\d/.test(rest) && rest.length < 72) {
      const wordCount = rest.split(/\s+/).filter(Boolean).length;
      // Short trade headings only; long lines are often real scope sentences without part numbers.
      if (wordCount <= 5) return true;
    }
  }

  if (/^(section|specification|spec)\s+[0-9]{1,3}([.\-][0-9A-Za-z]+)*$/i.test(t)) return true;
  if (/^part\s+[IVX\d]+$/i.test(t)) return true;

  if (/^(schedule|summary|index|table of contents|appendix)\s+(of|for)\b/i.test(t)) return true;
  if (/^(general\s+)?notes?\s*:/i.test(t)) return true;
  if (/^scope(\s+of\s+work)?\s*:/i.test(lower)) return true;
  if (/:$/.test(t) && t.length <= 56 && !/\d/.test(t)) return true;

  if (t.length >= 6 && t.length <= 82 && t === t.toUpperCase() && /[A-Z]{4,}/.test(t) && !/\d/.test(t)) {
    if (/\b(SCHEDULE|SUMMARY|SCOPE|DRAWING|DETAIL|ACCESSOR|PARTITION|FIXTURE|SPECIAL|TITLE|SHEET|NOTE|INDEX)\b/.test(t)) return true;
  }

  if (!/\d/.test(t) && t.length >= 12 && t.length <= 78) {
    if (/\b(accessories|specialties|equipment|systems|fixtures|partitions)\b/i.test(t)) {
      if (/\b(toilet|restroom|bathroom|locker|signage|visual|wall|fire|storage|shower|plumbing|washroom)\b/i.test(lower)) return true;
    }
  }

  if (/^(drawing|sheet|detail)\s*[#:]?\s*[A-Z0-9.-]{0,14}\s*$/i.test(t) && t.length < 44) return true;

  return false;
}

const PROPOSAL_OK_SYMBOLS = '.,;:\'’"&/@#+\\=()%-–—_*×°•·°¹²³¼½¾';

/**
 * One takeoff line worth mentioning in auto-generated "Scope appears to include …" copy.
 */
export function isPlausibleProposalScopeSnippet(text: string): boolean {
  const raw = String(text || '');
  if (!raw.trim() || raw.includes('\uFFFD')) return false;
  if (looksLikePdfExtractionNoiseLine(raw)) return false;
  if (looksLikePdfProposalBoilerplateLine(raw)) return false;
  if (looksLikeIntakeSectionHeaderOrTitleLine(raw)) return false;

  const t = intakeTrim(stripIntakeControlCharacters(raw)).replace(/\s+/g, ' ').trim();
  if (!t || t.length > 900) return false;

  const nonSpace = t.replace(/\s/g, '');
  if (nonSpace.length < 4) return false;

  let suspicious = 0;
  for (const ch of nonSpace) {
    if (/[A-Za-z0-9]/.test(ch)) continue;
    if (PROPOSAL_OK_SYMBOLS.includes(ch)) continue;
    if (/[\u00C0-\u024F]/.test(ch)) continue;
    suspicious += 1;
  }
  if (suspicious / nonSpace.length > 0.22) return false;

  const asciiLetters = [...nonSpace].filter((ch) => /[A-Za-z]/.test(ch)).length;
  if (nonSpace.length > 20 && asciiLetters / nonSpace.length < 0.38) return false;
  if (t.length > 28 && longestAsciiLetterRun(t) < 4) return false;

  return true;
}

/**
 * Proposal intro / terms / multi-line blocks: reject PDF binary dumps and decoder garbage.
 */
export function isPlausibleCustomerFacingProposalText(text: string): boolean {
  const raw = String(text || '');
  if (!raw.trim() || raw.includes('\uFFFD')) return false;

  const t = intakeTrim(stripIntakeControlCharacters(raw)).replace(/\s+/g, ' ').trim();
  if (!t) return false;

  const head = t.slice(0, Math.min(400, t.length));
  const tail = t.slice(-Math.min(200, t.length));
  if (looksLikePdfExtractionNoiseLine(head) || looksLikePdfExtractionNoiseLine(tail)) return false;

  const nonSpace = t.replace(/\s/g, '');
  if (nonSpace.length < 10) return false;

  let suspicious = 0;
  for (const ch of nonSpace) {
    if (/[A-Za-z0-9]/.test(ch)) continue;
    if (PROPOSAL_OK_SYMBOLS.includes(ch)) continue;
    if (/[\u00C0-\u024F]/.test(ch)) continue;
    suspicious += 1;
  }
  if (suspicious / nonSpace.length > 0.24) return false;

  const asciiLetters = [...nonSpace].filter((ch) => /[A-Za-z]/.test(ch)).length;
  if (nonSpace.length > 40 && asciiLetters / nonSpace.length < 0.28) return false;
  if (t.length > 56 && longestAsciiLetterRun(t) < 6) return false;

  return true;
}

/** Last-line defense: never surface mojibake / buffer dumps as a project name in API responses. */
export function coerceSafeProjectName(value: string, fallback = 'Imported Project'): string {
  const t = intakeTrim(stripIntakeControlCharacters(String(value || ''))).replace(/\s+/g, ' ').trim();
  if (!t) return fallback;
  return isPlausibleProjectTitle(t) ? t : fallback;
}

/** Use PDF/upload file stem as a title only when it looks like a real job name (not binary garbage). */
export function plausibleTitleFromFileName(fileName: string): string | null {
  const stem = String(fileName || '')
    .replace(/\.[^/.]+$/i, '')
    .replace(/[_]+/g, ' ')
    .trim();
  if (!stem) return null;
  return isPlausibleProjectTitle(stem) ? stem : null;
}
