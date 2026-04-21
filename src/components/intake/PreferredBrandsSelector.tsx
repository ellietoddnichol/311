import React, { useMemo, useState } from 'react';
import { Check, Search, X } from 'lucide-react';

interface Props {
  value: string[];
  options: string[];
  onChange: (next: string[]) => void;
}

/**
 * Multi-select field for project-level preferred brands / manufacturers.
 * - Search within brands
 * - Select all / clear all
 * - Shows active selections as pills
 * - If no brands are selected, caller treats the field as "no preference" (default behavior).
 */
export function PreferredBrandsSelector({ value, options, onChange }: Props) {
  const [query, setQuery] = useState('');

  const selectedSet = useMemo(() => new Set(value.map((entry) => entry.toLowerCase())), [value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((option) => option.toLowerCase().includes(q));
  }, [options, query]);

  const allSelected = options.length > 0 && options.every((option) => selectedSet.has(option.toLowerCase()));

  function toggle(brand: string) {
    const key = brand.toLowerCase();
    if (selectedSet.has(key)) {
      onChange(value.filter((entry) => entry.toLowerCase() !== key));
    } else {
      onChange([...value, brand].sort((a, b) => a.localeCompare(b)));
    }
  }

  function selectAll() {
    onChange([...options].sort((a, b) => a.localeCompare(b)));
  }

  function clearAll() {
    onChange([]);
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Preferred Brands</p>
          <p className="mt-1 text-xs text-slate-500">
            Prioritize catalog and import matches from these manufacturers. Other brands can still be used;
            this simply improves first-pass matching.
          </p>
        </div>
        <div className="flex shrink-0 gap-2 text-[11px] font-semibold">
          <button
            type="button"
            onClick={selectAll}
            className="rounded-full bg-white px-3 py-1 text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={allSelected || options.length === 0}
          >
            Select all
          </button>
          <button
            type="button"
            onClick={clearAll}
            className="rounded-full bg-white px-3 py-1 text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={value.length === 0}
          >
            Clear all
          </button>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
        <Search className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={options.length > 0 ? 'Search brands…' : 'No brands in catalog yet'}
          className="w-full border-0 bg-transparent text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none"
          aria-label="Search brands"
        />
      </div>

      {value.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Selected preferred brands">
          {value.map((brand) => (
            <span
              key={brand}
              className="inline-flex items-center gap-1 rounded-full bg-blue-700 px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm"
            >
              {brand}
              <button
                type="button"
                onClick={() => toggle(brand)}
                className="rounded-full p-0.5 hover:bg-blue-800"
                aria-label={`Remove ${brand}`}
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-3 max-h-44 overflow-auto rounded-xl border border-slate-200 bg-white">
        {filtered.length === 0 ? (
          <p className="p-3 text-xs text-slate-500">
            {options.length === 0
              ? 'Brands populate once the catalog has manufacturer data loaded.'
              : 'No brands match your search.'}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {filtered.map((brand) => {
              const checked = selectedSet.has(brand.toLowerCase());
              return (
                <li key={brand}>
                  <button
                    type="button"
                    onClick={() => toggle(brand)}
                    className={`flex w-full items-center justify-between px-3 py-2 text-left text-xs transition ${checked ? 'bg-blue-50 text-blue-800' : 'text-slate-700 hover:bg-slate-50'}`}
                  >
                    <span className="font-medium">{brand}</span>
                    {checked ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
