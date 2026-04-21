/**
 * Preferred project intake template.
 *
 * Column order is stable and matches the header aliases used by the parser so
 * that files generated from this template are parsed with highest confidence.
 */

export const IMPORT_TEMPLATE_HEADERS = [
  'Area / Room',
  'Item Name',
  'Quantity',
  'Unit',
  'Manufacturer',
  'Model / SKU',
  'Description',
  'Finish / Color',
  'Mounting / Install Type',
  'Notes',
  'Alternate / Allowance',
  'Adders / Modifiers',
  'Labor Scope',
  'Material Scope',
] as const;

export type ImportTemplateHeader = (typeof IMPORT_TEMPLATE_HEADERS)[number];

export const IMPORT_TEMPLATE_SAMPLE_ROWS: Array<Record<ImportTemplateHeader, string | number>> = [
  {
    'Area / Room': 'Men\u2019s Restroom 101',
    'Item Name': 'Grab Bar',
    Quantity: 2,
    Unit: 'EA',
    Manufacturer: 'Bobrick',
    'Model / SKU': 'B-5806 x 36',
    Description: '36" grab bar, peened finish, snap flange',
    'Finish / Color': 'Peened Finish',
    'Mounting / Install Type': 'Wall Mounted',
    Notes: 'ADA compliant',
    'Alternate / Allowance': '',
    'Adders / Modifiers': 'Security screws',
    'Labor Scope': 'Install',
    'Material Scope': 'Supply',
  },
  {
    'Area / Room': 'Women\u2019s Restroom 101',
    'Item Name': 'Paper Towel / Waste Receptacle Combo',
    Quantity: 1,
    Unit: 'EA',
    Manufacturer: 'Bobrick',
    'Model / SKU': 'B-3944',
    Description: 'Recessed combination unit, stainless steel',
    'Finish / Color': 'Stainless Steel',
    'Mounting / Install Type': 'Recessed',
    Notes: '',
    'Alternate / Allowance': '',
    'Adders / Modifiers': '',
    'Labor Scope': 'Install',
    'Material Scope': 'Supply',
  },
  {
    'Area / Room': 'Vestibule',
    'Item Name': 'Directory Sign',
    Quantity: 1,
    Unit: 'EA',
    Manufacturer: 'ASI',
    'Model / SKU': 'Signage Series 100',
    Description: 'ADA directory sign',
    'Finish / Color': 'Satin Finish',
    'Mounting / Install Type': 'Surface Mounted',
    Notes: 'Owner approved artwork',
    'Alternate / Allowance': 'Alternate',
    'Adders / Modifiers': '',
    'Labor Scope': 'Install',
    'Material Scope': 'Supply',
  },
];

export const IMPORT_TEMPLATE_INSTRUCTIONS = [
  'Fill in one row per scope line. Leave optional fields blank if not applicable.',
  'Required: Area / Room, Item Name, Quantity, Unit.',
  'Manufacturer + Model / SKU greatly improves catalog matching. If unknown, leave blank.',
  'Use inches (36") or feet-inches (5\'-6") for sizes. The importer will normalize these.',
  'Finish / Color and Mounting / Install Type help the importer beautify the final line description.',
];

/** Escape a single CSV cell. */
function escapeCsvCell(value: string | number | null | undefined): string {
  const raw = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

/** Generate the preferred import template as CSV text. */
export function buildImportTemplateCsv(): string {
  const rows: Array<Array<string | number>> = [];
  rows.push([...IMPORT_TEMPLATE_HEADERS]);
  IMPORT_TEMPLATE_SAMPLE_ROWS.forEach((entry) => {
    rows.push(IMPORT_TEMPLATE_HEADERS.map((header) => entry[header] ?? ''));
  });
  return rows.map((row) => row.map(escapeCsvCell).join(',')).join('\n');
}

/**
 * Returns true if the provided headers (from a parsed file) appear to match the
 * preferred template layout. Used by the parser to boost confidence.
 */
export function matchesPreferredTemplate(headers: Array<string | null | undefined>): boolean {
  const required = ['Area / Room', 'Item Name', 'Quantity', 'Unit'];
  const normalized = headers.map((header) => String(header || '').toLowerCase().replace(/\s+/g, ' ').trim());
  return required.every((label) => {
    const needle = label.toLowerCase();
    return normalized.some((header) => header === needle);
  });
}
