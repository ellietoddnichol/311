import React from 'react';

interface Props {
  parts: Array<string | null | undefined | false>;
  tone?: 'takeoff' | 'estimate';
}

export function CompactMetadataLine({ parts, tone = 'estimate' }: Props) {
  const items = parts.filter(Boolean) as string[];

  if (items.length === 0) {
    return null;
  }

  return (
    <p className={`mt-1 text-[10px] ${tone === 'takeoff' ? 'text-slate-500' : 'text-slate-500'}`}>
      {items.join(' · ')}
    </p>
  );
}