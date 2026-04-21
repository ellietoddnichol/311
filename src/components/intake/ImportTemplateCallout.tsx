import React from 'react';
import { Download, FileSpreadsheet, Info } from 'lucide-react';
import {
  buildImportTemplateCsv,
  IMPORT_TEMPLATE_HEADERS,
  IMPORT_TEMPLATE_INSTRUCTIONS,
  IMPORT_TEMPLATE_SAMPLE_ROWS,
} from '../../shared/utils/importTemplate';

function triggerBrowserDownload(fileName: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function downloadCsv() {
  const csv = buildImportTemplateCsv();
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  triggerBrowserDownload('division-10-import-template.csv', blob);
}

async function downloadXlsx() {
  const xlsx = await import('xlsx');
  const worksheet = xlsx.utils.json_to_sheet(IMPORT_TEMPLATE_SAMPLE_ROWS, { header: [...IMPORT_TEMPLATE_HEADERS] });
  worksheet['!cols'] = IMPORT_TEMPLATE_HEADERS.map(() => ({ wch: 22 }));
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, worksheet, 'Import Template');
  const buffer = xlsx.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  triggerBrowserDownload('division-10-import-template.xlsx', blob);
}

/**
 * Compact callout with buttons to download the preferred import template as CSV or XLSX.
 * Keep prominent but not cluttered — sits above the takeoff upload drop zone.
 */
export function ImportTemplateCallout() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-3">
          <FileSpreadsheet className="mt-0.5 h-5 w-5 text-blue-700" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-slate-900">Preferred Import Template</p>
            <p className="mt-1 text-xs text-slate-600">
              Imports work best when using our template. The importer will detect it automatically and parse
              with higher confidence.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={downloadCsv}
            className="inline-flex items-center gap-1.5 rounded-full bg-blue-700 px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm transition hover:bg-blue-800"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Download CSV
          </button>
          <button
            type="button"
            onClick={() => { void downloadXlsx(); }}
            className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Download Excel
          </button>
        </div>
      </div>

      <details className="mt-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-xs text-slate-600">
        <summary className="flex cursor-pointer items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
          <Info className="h-3 w-3" aria-hidden="true" />
          Template fields &amp; tips
        </summary>
        <ul className="mt-2 space-y-1 pl-5 list-disc">
          {IMPORT_TEMPLATE_INSTRUCTIONS.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
        <p className="mt-2 font-semibold text-slate-700">Columns</p>
        <p className="mt-0.5 leading-relaxed text-slate-600">{IMPORT_TEMPLATE_HEADERS.join(' · ')}</p>
      </details>
    </div>
  );
}
