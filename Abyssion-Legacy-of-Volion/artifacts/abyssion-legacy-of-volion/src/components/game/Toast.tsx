'use client';

import { useEffect, useState } from 'react';
import { subscribeToasts, type ToastEntry, type ToastTone } from '@/lib/toast';

/* ── Toast stack (M2D1 #2) ─────────────────────────────────────────────
 *  Renders whatever src/lib/toast.ts currently holds. Module-scope state,
 *  not store state: nothing here is persisted and no store slice exists.
 *  Mounted as the last sibling inside <main> at z-[250], above every modal
 *  (Inventory z-40, Shop z-50, DebugOverlay z-200). The outer container is
 *  pointer-events-none so it never eats input; each toast re-enables
 *  pointer events for a future click-to-dismiss (not implemented here). */

/** Tone sets only the left-border colour; the other three sides stay #d68a31. */
const TONE_BORDER: Record<ToastTone, string> = {
  info: 'border-l-4 border-l-gray-500',
  warn: 'border-l-4 border-l-amber-500',
  error: 'border-l-4 border-l-red-600',
};

function ToastItem({ entry }: { entry: ToastEntry }) {
  // 150 ms opacity fade-in only — no slide, no scale, no extra animation.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      className={`pointer-events-auto max-w-[360px] rounded-md border border-[#d68a31] bg-gray-900/95 px-3 py-2 text-sm font-bold tracking-wide text-[#e8d5ae] shadow-lg transition-opacity duration-150 ${TONE_BORDER[entry.tone]} ${
        shown ? 'opacity-100' : 'opacity-0'
      }`}
    >
      {entry.message}
    </div>
  );
}

export default function Toast() {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);

  useEffect(() => subscribeToasts(setToasts), []);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed left-1/2 top-14 z-[250] flex -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map((entry) => (
        <ToastItem key={entry.id} entry={entry} />
      ))}
    </div>
  );
}
