import React from 'react';

interface Props {
  title: string;
  items: string[];
}

export function ValidationSummaryBanner({ title, items }: Props) {
  if (!items.length) return null;
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3">
      <p className="ui-eyebrow text-amber-800">{title}</p>
      <ul className="mt-2 space-y-1 text-xs text-amber-900">
        {items.map((entry) => (
          <li key={entry}>- {entry}</li>
        ))}
      </ul>
    </div>
  );
}
