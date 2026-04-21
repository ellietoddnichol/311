import React, { useState } from 'react';
import { Info } from 'lucide-react';
import { beautifyItemName } from '../../shared/utils/itemNameBeautifier';

interface Props {
  /** Raw text the user originally provided or the importer extracted. */
  rawText: string;
  /** Optional explicit item name (already split out from the raw source). */
  itemName?: string | null;
  /** Optional explicit description column. */
  description?: string | null;
  /** Optional explicit manufacturer column value. */
  manufacturer?: string | null;
  /** Optional explicit model column value. */
  model?: string | null;
  /** Optional finish column value. */
  finish?: string | null;
  /** Project-level preferred brands (used for confidence hinting). */
  preferredBrands?: string[];
  /** If the matched catalog row's brand came from a preferred brand, show a badge. */
  brandInferredFromPreferred?: boolean;
}

/**
 * Displays the beautified, estimator-friendly name for a raw intake line along with
 * a small info affordance that reveals the untouched raw text plus the parsed
 * attributes. The raw text is preserved by the caller; we never overwrite it.
 */
export function BeautifiedLineHeader(props: Props) {
  const [open, setOpen] = useState(false);
  const raw = String(props.rawText || props.description || props.itemName || '').trim();
  const beautiful = beautifyItemName([props.itemName, props.description, raw].filter(Boolean).join(' '), {
    manufacturer: props.manufacturer,
    model: props.model,
    finish: props.finish,
    preferredBrands: props.preferredBrands,
  });

  const display = beautiful.beautifiedName || raw;
  const confidenceLabel = beautiful.confidence === 'high' ? 'High confidence' : beautiful.confidence === 'medium' ? 'Medium confidence' : 'Low confidence';
  const confidenceTone = beautiful.confidence === 'high'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : beautiful.confidence === 'medium'
      ? 'border-blue-200 bg-blue-50 text-blue-700'
      : 'border-slate-200 bg-slate-50 text-slate-600';

  return (
    <div className="mb-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[13px] font-semibold text-slate-900">{display}</p>
        <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${confidenceTone}`}>
          {confidenceLabel}
        </span>
        {props.brandInferredFromPreferred ? (
          <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700">
            Brand from project preference
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="inline-flex items-center gap-1 rounded-full bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 ring-1 ring-slate-200 transition hover:bg-slate-50"
          aria-expanded={open}
          aria-label="Show raw text and parsed attributes"
        >
          <Info className="h-3 w-3" aria-hidden="true" />
          {open ? 'Hide' : 'Raw'}
        </button>
      </div>

      {open ? (
        <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2 text-[11px] text-slate-600">
          <p className="font-semibold text-slate-700">Raw source</p>
          <p className="mt-0.5 font-mono text-[11px] leading-relaxed text-slate-700">{raw || '(empty)'}</p>
          <p className="mt-2 font-semibold text-slate-700">Parsed attributes</p>
          <ul className="mt-0.5 grid grid-cols-1 gap-x-4 gap-y-0.5 md:grid-cols-2">
            <li>Category: {beautiful.parsedAttributes.category || '—'}</li>
            <li>Size: {beautiful.parsedAttributes.sizeInches || '—'}</li>
            <li>Finish: {beautiful.parsedAttributes.finish || '—'}</li>
            <li>Mounting: {beautiful.parsedAttributes.mounting || '—'}</li>
            <li>Manufacturer: {beautiful.parsedAttributes.manufacturer || '—'}</li>
            <li>Model: {beautiful.parsedAttributes.model || '—'}</li>
            {beautiful.parsedAttributes.configuration.length > 0 ? (
              <li className="md:col-span-2">Configuration: {beautiful.parsedAttributes.configuration.join(', ')}</li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
