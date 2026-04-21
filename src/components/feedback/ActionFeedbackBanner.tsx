import React from 'react';

type FeedbackTone = 'success' | 'error' | 'info' | 'warning';

interface Props {
  tone: FeedbackTone;
  message: string;
  onDismiss?: () => void;
}

const toneClassMap: Record<FeedbackTone, string> = {
  success: 'border-emerald-200 bg-emerald-50/80 text-emerald-800',
  error: 'border-red-200 bg-red-50/80 text-red-800',
  info: 'border-blue-200 bg-blue-50/80 text-blue-800',
  warning: 'border-amber-200 bg-amber-50/80 text-amber-800',
};

export function ActionFeedbackBanner({ tone, message, onDismiss }: Props) {
  if (!message.trim()) return null;
  return (
    <div className={`rounded-xl border px-3 py-2 text-sm ${toneClassMap[tone]}`}>
      <div className="flex items-center justify-between gap-2">
        <p>{message}</p>
        {onDismiss ? (
          <button type="button" onClick={onDismiss} className="text-xs font-semibold underline underline-offset-2">
            Dismiss
          </button>
        ) : null}
      </div>
    </div>
  );
}
