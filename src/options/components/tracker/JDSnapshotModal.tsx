import type { Application } from '@shared/types/application.types';
import { format } from 'date-fns';
import { useEffect, useRef } from 'react';

interface Props {
  application: Application | null;
  onClose: () => void;
}

export default function JDSnapshotModal({ application, onClose }: Props) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!application) return;
    // Save the element that opened the modal so we can restore focus on close.
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    // Move initial focus to the close button.
    closeButtonRef.current?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      // Focus trap: Tab and Shift+Tab cycle within the dialog. Without
      // this, Tab leaks back into the underlying Tracker page.
      if (e.key === 'Tab' && dialogRef.current) {
        const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
        );
        // Visibility check: offsetParent === null misses position:fixed
        // descendants (they always report null), and the dialog itself is
        // fixed-positioned. Use getClientRects() length instead, which is
        // the canonical "is rendered" test and works for fixed children too.
        const list = Array.from(focusables).filter((el) => {
          if (el.hasAttribute('aria-hidden')) return false;
          if (el.getClientRects().length === 0) return false;
          const style = window.getComputedStyle(el);
          if (style.visibility === 'hidden' || style.display === 'none') return false;
          return true;
        });
        if (list.length === 0) return;
        const first = list[0];
        const last = list[list.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused.current?.focus?.();
    };
  }, [application, onClose]);

  if (!application) return null;
  const snap = application.jdSnapshot;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Job description snapshot"
      aria-describedby="jd-snapshot-body"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        ref={dialogRef}
        style={{
          background: '#fff',
          borderRadius: 12,
          padding: 24,
          maxWidth: 720,
          maxHeight: '80vh',
          overflowY: 'auto',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: 16,
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: 18 }}>{snap?.title ?? '(no title)'}</h2>
            <div style={{ color: '#64748b', marginTop: 4 }}>{snap?.company ?? '(no company)'}</div>
          </div>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            aria-label="Close JD snapshot"
            type="button"
            style={{
              background: 'none',
              border: 'none',
              fontSize: 24,
              lineHeight: 1,
              cursor: 'pointer',
              color: '#64748b',
              padding: '0 8px',
            }}
          >
            <span aria-hidden="true">{'\u00D7'}</span>
          </button>
        </div>

        {snap?.capturedAt && (
          <div
            style={{
              fontSize: 12,
              color: '#94a3b8',
              marginBottom: 16,
              padding: '8px 12px',
              background: '#f8fafc',
              borderRadius: 6,
            }}
          >
            Captured at {format(new Date(snap.capturedAt), 'PPpp')}. This snapshot is frozen, even
            if the listing has been edited or deleted on the company site since.
          </div>
        )}

        {snap?.url && /^https?:\/\//i.test(snap.url) && (
          <div style={{ marginBottom: 12, fontSize: 12 }}>
            <a href={snap.url} target="_blank" rel="noopener noreferrer">
              {snap.url}
            </a>
          </div>
        )}

        <pre
          id="jd-snapshot-body"
          tabIndex={0}
          style={{
            whiteSpace: 'pre-wrap',
            fontFamily: 'inherit',
            fontSize: 14,
            lineHeight: 1.6,
            background: '#fafafa',
            padding: 16,
            borderRadius: 8,
            border: '1px solid #e2e8f0',
            margin: 0,
          }}
        >
          {snap?.jdText ?? '(no JD text was captured for this application)'}
        </pre>
      </div>
    </div>
  );
}
