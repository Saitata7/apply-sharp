/**
 * MutationObserver-based watcher.
 *
 * Watches for new forms or dialogs being added to the DOM, debounces, and
 * fires a callback when one is ready. This is what makes Wellfound's apply
 * modal (which mounts only after the user clicks Apply) work; the old
 * one-shot detector at form-detector.ts ran on document_idle and missed it.
 */

const DEBOUNCE_MS = 250;

export type FormReadyCallback = () => void;

export interface FormWatcher {
  start(): void;
  stop(): void;
}

function debounce<F extends () => void>(fn: F, ms: number): F {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return ((): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(), ms);
  }) as F;
}

export function createFormWatcher(onChange: FormReadyCallback): FormWatcher {
  let observer: MutationObserver | null = null;
  const debounced = debounce(onChange, DEBOUNCE_MS);

  return {
    start(): void {
      if (observer) return;
      observer = new MutationObserver(() => debounced());
      observer.observe(document.body, { childList: true, subtree: true });
      // Fire once immediately for forms that already exist at script load.
      debounced();
    },
    stop(): void {
      observer?.disconnect();
      observer = null;
    },
  };
}
