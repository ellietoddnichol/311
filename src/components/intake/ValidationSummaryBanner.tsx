import React from 'react';

interface Props {
  title: string;
  items: Array<{ text: string; targetId?: string }>;
  onSelect?: (targetId?: string) => void;
}

export function ValidationSummaryBanner({ title, items, onSelect }: Props) {
  if (!items.length) return null;
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3">
      <p className="ui-eyebrow text-amber-800">{title}</p>
      <ul className="mt-2 space-y-1 text-xs text-amber-900">
        {items.map((entry) => (
          <li key={`${entry.text}-${entry.targetId || 'none'}`}>
            <button
              type="button"
              onClick={() => onSelect?.(entry.targetId)}
              className={`text-left ${entry.targetId ? 'underline decoration-dotted underline-offset-2 hover:text-amber-700' : ''}`}
            >
              - {entry.text}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
