export type ToastTone = 'info' | 'warn' | 'error';

export interface ToastEntry {
  id: number;
  message: string;
  tone: ToastTone;
}

// Internal, not exported:
let nextId = 1;
let toasts: ToastEntry[] = [];
const listeners = new Set<(list: ToastEntry[]) => void>();

function emit() {
  const snapshot = toasts;
  for (const fn of listeners) fn(snapshot);
}

export function pushToast(
  message: string,
  tone: ToastTone = 'info'
): number {
  const id = nextId++;
  toasts = [...toasts, { id, message, tone }];
  emit();
  // Auto-dismiss after 4000 ms.
  if (typeof window !== 'undefined') {
    window.setTimeout(() => dismissToast(id), 4000);
  }
  return id;
}

export function dismissToast(id: number): void {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function subscribeToasts(
  fn: (list: ToastEntry[]) => void
): () => void {
  listeners.add(fn);
  fn(toasts);
  return () => {
    listeners.delete(fn);
  };
}

// M2D2 #1 — fixed-format event notifiers. Pure wrappers over pushToast: no
// state, no dedupe, no rate limiting. Two identical events produce two toasts,
// exactly like any other pushToast caller.

export function notifyMasteryLevelUp(
  itemName: string,
  oldLevel: number,
  newLevel: number
): void {
  pushToast(
    `Mastery — ${itemName}: Lv ${oldLevel} → ${newLevel}`,
    'info'
  );
}

export function notifyItemDiscarded(
  itemName: string,
  count: number
): void {
  pushToast(
    count > 1
      ? `Discarded ${count}× ${itemName}`
      : `Discarded ${itemName}`,
    'info'
  );
}

export function notifyCureUsed(itemName: string): void {
  pushToast(`${itemName} — curses reduced`, 'info');
}
