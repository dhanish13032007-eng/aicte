"use client";

/** Minimal module-level toast bus (no external dependency). */
type Kind = "success" | "error" | "info";

export interface ToastItem {
  id: number;
  kind: Kind;
  message: string;
}

let seq = 0;
const listeners = new Set<(t: ToastItem[]) => void>();
let items: ToastItem[] = [];

function emit() {
  for (const l of listeners) l([...items]);
}

export function toast(message: string, kind: Kind = "success") {
  const t: ToastItem = { id: ++seq, kind, message };
  items = [...items, t];
  emit();
  setTimeout(() => {
    items = items.filter((x) => x.id !== t.id);
    emit();
  }, 5000);
}

export function dismissToast(id: number) {
  items = items.filter((x) => x.id !== id);
  emit();
}

export function subscribe(fn: (t: ToastItem[]) => void) {
  listeners.add(fn);
  fn([...items]);
  return () => {
    listeners.delete(fn);
  };
}
