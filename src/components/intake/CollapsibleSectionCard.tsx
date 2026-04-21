import React from 'react';
import { ChevronDown } from 'lucide-react';

interface Props {
  title: string;
  description?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export function CollapsibleSectionCard({ title, description, defaultOpen = true, children }: Props) {
  return (
    <details open={defaultOpen} className="ui-card group overflow-hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
        <div>
          <p className="ui-eyebrow">{title}</p>
          {description ? <p className="mt-1 text-xs text-slate-500">{description}</p> : null}
        </div>
        <ChevronDown className="h-4 w-4 text-slate-500 transition group-open:rotate-180" />
      </summary>
      <div className="border-t border-slate-100 px-4 py-3">
        {children}
      </div>
    </details>
  );
}
