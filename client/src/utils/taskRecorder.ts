/**
 * Task recorder: logs user actions (clicks) and app responses for debugging.
 * Use the floating "Log" panel in the app to view the last N entries.
 */

export interface TaskLogEntry {
  id: number;
  time: string;
  type: string;
  message: string;
  detail?: Record<string, unknown>;
}

const MAX_ENTRIES = 100;
let nextId = 1;
const entries: TaskLogEntry[] = [];
const listeners: Set<() => void> = new Set();

function emit() {
  listeners.forEach((cb) => cb());
}

function timeStr(): string {
  const d = new Date();
  return d.toTimeString().slice(0, 8) + '.' + String(d.getMilliseconds()).padStart(3, '0');
}

export function taskLog(
  type: string,
  message: string,
  detail?: Record<string, unknown>
): void {
  const entry: TaskLogEntry = {
    id: nextId++,
    time: timeStr(),
    type,
    message,
    ...(detail != null && Object.keys(detail).length > 0 ? { detail } : {}),
  };
  entries.push(entry);
  if (entries.length > MAX_ENTRIES) entries.shift();
  // Skip console.log to avoid lag when DevTools is open; use the Log panel instead
  emit();
}

export function getTaskLog(): TaskLogEntry[] {
  return [...entries];
}

export function clearTaskLog(): void {
  entries.length = 0;
  emit();
}

export function subscribeTaskLog(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

/** Describe an element for logging (tag, id, classes, data attrs). */
export function describeElement(el: EventTarget | null): Record<string, unknown> {
  if (!el || !(el instanceof Element)) return { target: 'non-element' };
  const e = el as Element;
  const tag = e.tagName?.toLowerCase() || '?';
  const id = e.id || undefined;
  const cls = e.className && typeof e.className === 'string' ? e.className.trim().slice(0, 80) : undefined;
  const dataAttrs: Record<string, string> = {};
  if (e.hasAttribute?.('data-server-menu-trigger')) dataAttrs['data-server-menu-trigger'] = 'true';
  if (e.hasAttribute?.('aria-label')) dataAttrs['aria-label'] = String(e.getAttribute('aria-label'));
  const text = (e.textContent ?? '').trim().slice(0, 40);
  return { tag, id, class: cls, ...dataAttrs, text: text || undefined };
}
