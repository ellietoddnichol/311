import React, { useMemo } from 'react';
import { ProjectRecord, SettingsRecord, TakeoffLineRecord } from '../../shared/types/estimator';
import { buildProjectConditionSummaryLines } from '../../shared/utils/jobConditions';
import { DEFAULT_PROPOSAL_CLARIFICATIONS, DEFAULT_PROPOSAL_EXCLUSIONS, DEFAULT_PROPOSAL_INTRO, DEFAULT_PROPOSAL_TERMS } from '../../shared/utils/proposalDefaults';
import { formatCurrencySafe } from '../../utils/numberFormat';

interface Props {
  project: ProjectRecord;
  settings: SettingsRecord | null;
  website: string;
  lines: TakeoffLineRecord[];
  summary: {
    materialSubtotal: number;
    laborSubtotal: number;
    adjustedLaborSubtotal: number;
    lineSubtotal: number;
    conditionAdjustmentAmount: number;
    conditionLaborMultiplier: number;
    burdenAmount: number;
    overheadAmount: number;
    profitAmount: number;
    taxAmount: number;
    baseBidTotal: number;
    conditionAssumptions: string[];
  } | null;
}

function isClientFacingLabel(label: string): boolean {
  const normalized = label.toLowerCase().trim();
  if (!normalized) return false;

  const blockedExact = new Set(['uncategorized', 'general scope', 'general', 'internal', 'test']);
  if (blockedExact.has(normalized)) return false;

  const blockedPattern = /(room|area|zone|test|internal|uncategorized|general scope)/i;
  return !blockedPattern.test(normalized);
}

function splitIntoLines(value: string | null | undefined): string[] {
  return String(value || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function toSentenceCase(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function trimScopeHighlight(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, ' ');
  if (trimmed.length <= 56) return trimmed;
  return `${trimmed.slice(0, 53).trim()}...`;
}

export function ProposalPreview({ project, settings, website, lines, summary }: Props) {
  if (!summary) return <div className="text-sm text-slate-500">No estimate data yet.</div>;

  const showOverhead = project.overheadPercent > 0;
  const pricingMode = project.pricingMode || 'labor_and_material';
  const showMaterial = pricingMode !== 'labor_only';
  const showLabor = pricingMode !== 'material_only';
  const proposalVersion = `v${new Date(project.updatedAt).getTime().toString().slice(-5)}`;
  const proposalDate = project.proposalDate
    ? new Date(project.proposalDate).toLocaleDateString()
    : new Date().toLocaleDateString();
  const conditionLines = buildProjectConditionSummaryLines(project.jobConditions);
  const termLines = splitIntoLines(settings?.proposalTerms || DEFAULT_PROPOSAL_TERMS);
  const exclusionLines = splitIntoLines(settings?.proposalExclusions || DEFAULT_PROPOSAL_EXCLUSIONS);
  const clarificationLines = splitIntoLines(settings?.proposalClarifications || DEFAULT_PROPOSAL_CLARIFICATIONS);

  const scopeBreakout = useMemo(() => {
    const sectionMap = new Map<string, {
      section: string;
      itemCount: number;
      material: number;
      labor: number;
      total: number;
      highlights: string[];
    }>();

    const cleanSectionLabel = (line: TakeoffLineRecord): string => {
      const rawCategory = (line.category || '').trim();
      const rawSubcategory = (line.subcategory || '').trim();
      const rawBaseType = (line.baseType || '').trim();

      if (isClientFacingLabel(rawCategory)) return rawCategory;
      if (isClientFacingLabel(rawSubcategory)) return rawSubcategory;
      if (isClientFacingLabel(rawBaseType)) return rawBaseType;
      return 'Additional Scope';
    };

    lines.forEach((line) => {
      const section = cleanSectionLabel(line);
      const existing = sectionMap.get(section) || {
        section,
        itemCount: 0,
        material: 0,
        labor: 0,
        total: 0,
        highlights: [],
      };

      existing.itemCount += 1;
      const material = showMaterial ? line.materialCost * line.qty : 0;
      const labor = showLabor ? line.laborCost * line.qty : 0;
      existing.material += material;
      existing.labor += labor;
      existing.total += material + labor;

      if (existing.highlights.length < 4 && line.description) {
        const description = line.description.trim();
        if (description && !existing.highlights.includes(description) && description.length <= 120) {
          existing.highlights.push(description);
        }
      }

      sectionMap.set(section, existing);
    });

    return Array.from(sectionMap.values()).sort((a, b) => b.total - a.total);
  }, [lines, showLabor, showMaterial]);

  const scopeSummaryRows = useMemo(() => {
    return scopeBreakout.slice(0, 8).map((entry) => {
      const examples = entry.highlights.slice(0, 2).map(trimScopeHighlight);
      const descriptor = examples.length > 0 ? ` Includes ${examples.join(' and ')}.` : '';
      return {
        ...entry,
        summary: `${toSentenceCase(entry.section)} includes ${entry.itemCount} scoped ${entry.itemCount === 1 ? 'item' : 'items'}.${descriptor}`,
      };
    });
  }, [scopeBreakout]);

  return (
    <article data-proposal-document="true" className="print-proposal proposal-document mx-auto max-w-[8.27in] bg-white px-10 py-12 text-slate-900 shadow-[0_22px_56px_rgba(15,23,42,0.08)]">
      <header className="border-b border-slate-200 pb-6">
        <div className="flex items-start justify-between gap-6">
          <div className="flex items-start gap-4">
            {settings?.logoUrl ? (
              <img src={settings.logoUrl} alt="Company logo" className="h-14 w-14 object-contain" />
            ) : null}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">Proposal</p>
              <h1 className="mt-2 text-[28px] font-semibold tracking-[-0.04em] text-slate-950">{settings?.companyName || 'Brighten Builders, LLC'}</h1>
              <div className="mt-3 space-y-1 text-[13px] text-slate-600">
                <p>{settings?.companyAddress || ''}</p>
                <p>{settings?.companyPhone || ''} {settings?.companyEmail ? `| ${settings.companyEmail}` : ''}</p>
                <p>{website}</p>
              </div>
            </div>
          </div>
          <div className="min-w-[240px] text-right text-[13px] text-slate-600">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Client / Project</p>
            <div className="mt-3 space-y-1">
              <p className="text-[18px] font-semibold text-slate-950">{project.projectName}</p>
              <p>{project.clientName || 'Client'}</p>
              {project.address ? <p>{project.address}</p> : null}
              <p>Project #{project.projectNumber || project.id.slice(0, 8)}</p>
              <p>Date {proposalDate}</p>
              <p className="text-[11px] text-slate-500">Version {proposalVersion}</p>
            </div>
          </div>
        </div>
      </header>

      <section className="mt-8">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Scope Summary</h2>
        <div className="mt-3 whitespace-pre-wrap text-[15px] leading-7 text-slate-700">
          {settings?.proposalIntro || DEFAULT_PROPOSAL_INTRO}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Included Scope</h2>
        <div className="mt-4 space-y-3">
          {scopeSummaryRows.map((entry) => (
            <div key={entry.section} className="border-b border-slate-100 pb-3 last:border-b-0 last:pb-0">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-[16px] font-semibold text-slate-950">{entry.section}</h3>
                  <p className="mt-1 text-[14px] leading-6 text-slate-600">{entry.summary}</p>
                </div>
                <div className="shrink-0 text-right text-[13px] text-slate-500">
                  <p>{entry.itemCount} {entry.itemCount === 1 ? 'item' : 'items'}</p>
                  <p className="mt-1 font-semibold text-slate-900">{formatCurrencySafe(entry.total)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {conditionLines.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Project Assumptions</h2>
          <ul className="mt-3 space-y-2 text-[13px] leading-6 text-slate-600">
            {conditionLines.map((line) => (
              <li key={line} className="flex gap-2"><span className="text-slate-400">•</span><span>{line}</span></li>
            ))}
          </ul>
        </section>
      ) : null}

      {project.specialNotes?.trim() ? (
        <section className="mt-8">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Additional Notes</h2>
          <p className="mt-3 whitespace-pre-wrap text-[14px] leading-7 text-slate-600">{project.specialNotes}</p>
        </section>
      ) : null}

      <section className="mt-8">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Pricing Summary</h2>
        <div className="mt-4 overflow-hidden border border-slate-200">
          <table className="w-full text-[13px]">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Item</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-600">Amount</th>
              </tr>
            </thead>
            <tbody>
              {showMaterial ? (
                <tr className="border-t border-slate-100">
                  <td className="px-4 py-3 text-slate-700">Material</td>
                  <td className="px-4 py-3 text-right text-slate-900">{formatCurrencySafe(summary.materialSubtotal)}</td>
                </tr>
              ) : null}
              {showLabor ? (
                <tr className="border-t border-slate-100">
                  <td className="px-4 py-3 text-slate-700">Labor</td>
                  <td className="px-4 py-3 text-right text-slate-900">{formatCurrencySafe(summary.adjustedLaborSubtotal || summary.laborSubtotal)}</td>
                </tr>
              ) : null}
              {showOverhead ? (
                <tr className="border-t border-slate-100">
                  <td className="px-4 py-3 text-slate-700">Overhead</td>
                  <td className="px-4 py-3 text-right text-slate-900">{formatCurrencySafe(summary.overheadAmount)}</td>
                </tr>
              ) : null}
              <tr className="border-t border-slate-100">
                <td className="px-4 py-3 text-slate-700">Profit</td>
                <td className="px-4 py-3 text-right text-slate-900">{formatCurrencySafe(summary.profitAmount)}</td>
              </tr>
              {showMaterial ? (
                <tr className="border-t border-slate-100">
                  <td className="px-4 py-3 text-slate-700">Tax</td>
                  <td className="px-4 py-3 text-right text-slate-900">{formatCurrencySafe(summary.taxAmount)}</td>
                </tr>
              ) : null}
              <tr className="border-t-2 border-slate-300 bg-slate-50">
                <td className="px-4 py-3 text-[15px] font-semibold text-slate-950">Total Proposal</td>
                <td className="px-4 py-3 text-right text-[16px] font-semibold text-slate-950">{formatCurrencySafe(summary.baseBidTotal)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8 grid gap-8 md:grid-cols-3">
        <div>
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Terms</h2>
          <ul className="mt-3 space-y-2 text-[13px] leading-6 text-slate-600">
            {termLines.map((line) => (
              <li key={line} className="flex gap-2"><span className="text-slate-400">•</span><span>{line}</span></li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Exclusions</h2>
          <ul className="mt-3 space-y-2 text-[13px] leading-6 text-slate-600">
            {exclusionLines.map((line) => (
              <li key={line} className="flex gap-2"><span className="text-slate-400">•</span><span>{line}</span></li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Clarifications</h2>
          <ul className="mt-3 space-y-2 text-[13px] leading-6 text-slate-600">
            {clarificationLines.map((line) => (
              <li key={line} className="flex gap-2"><span className="text-slate-400">•</span><span>{line}</span></li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mt-12 grid grid-cols-2 gap-10 border-t border-slate-300 pt-8 text-[12px]">
        <div>
          <p className="mb-2 text-slate-500 uppercase tracking-[0.18em]">Acceptance</p>
          <div className="mb-2 h-12 border-b border-slate-400" />
          <p>{settings?.proposalAcceptanceLabel || 'Accepted By'}</p>
        </div>
        <div>
          <p className="mb-2 text-slate-500 uppercase tracking-[0.18em]">Date</p>
          <div className="mb-2 h-12 border-b border-slate-400" />
          <p>Authorized Signature Date</p>
        </div>
      </section>
    </article>
  );
}
