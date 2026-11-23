import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { Icon } from './Icon';
import { isMobileViewport } from '../utils';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  icon?: string;
  children: ReactNode;
  footer?: ReactNode;
  headerAction?: ReactNode;
  large?: boolean;
  dismissible?: boolean;
  showClose?: boolean;
}

interface DragState {
  active: boolean;
  startY: number;
  startedAt: number;
  height: number;
  delta: number;
}

const CLOSE_ANIMATION_MS = 300;

export function Sheet({
  open,
  onClose,
  title,
  icon,
  children,
  footer,
  headerAction,
  large = false,
  dismissible = true,
  showClose = true,
}: SheetProps) {
  const [mounted, setMounted] = useState(open);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const drag = useRef<DragState>({ active: false, startY: 0, startedAt: 0, height: 0, delta: 0 });
  const dismissTimer = useRef<number | null>(null);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setOffset(0);
      setDragging(false);
    } else {
      const timer = window.setTimeout(() => setMounted(false), CLOSE_ANIMATION_MS);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && dismissible) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, dismissible, onClose]);

  useEffect(
    () => () => {
      if (dismissTimer.current) window.clearTimeout(dismissTimer.current);
    },
    []
  );

  if (!mounted) return null;

  const beginDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (!dismissible || !isMobileViewport()) return;
    const target = event.target as HTMLElement;
    if (target.closest('button, input, textarea, select, a')) return;

    const panel = panelRef.current;
    if (!panel) return;

    drag.current = {
      active: true,
      startY: event.clientY,
      startedAt: performance.now(),
      height: panel.offsetHeight,
      delta: 0,
    };
    setDragging(true);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic pointers (and some browsers) cannot be captured
    }
  };

  const moveDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (!drag.current.active) return;
    const delta = Math.max(0, event.clientY - drag.current.startY);
    drag.current.delta = delta;
    setOffset(delta);
  };

  const endDrag = () => {
    if (!drag.current.active) return;
    const { delta, height, startedAt } = drag.current;
    drag.current.active = false;
    setDragging(false);

    const elapsed = Math.max(1, performance.now() - startedAt);
    const velocity = delta / elapsed;
    const shouldDismiss = dismissible && (delta > Math.max(88, height * 0.28) || (velocity > 0.55 && delta > 28));

    if (shouldDismiss) {
      setOffset(height + 48);
      dismissTimer.current = window.setTimeout(onClose, 160);
      return;
    }
    setOffset(0);
  };

  const panelStyle: CSSProperties | undefined =
    offset > 0 ? { transform: `translateY(${offset}px)`, transition: dragging ? 'none' : undefined } : undefined;

  return (
    <div
      className={`modal-backdrop ${open ? 'active' : ''} ${dragging ? 'sheet-dragging' : ''}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && dismissible) onClose();
      }}
    >
      <div
        ref={panelRef}
        className={`modal-window sheet ${large ? 'modal-window-lg' : ''} ${dragging ? 'sheet-dragging' : ''}`}
        style={panelStyle}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div
          className="sheet-grabber"
          onPointerDown={beginDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        />

        <div
          className="modal-header"
          onPointerDown={beginDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <div className="modal-header-title">
            {icon ? <Icon name={icon} className="icon icon-sm" /> : null}
            <div className="modal-title">{title}</div>
          </div>
          <div className="modal-header-actions">
            {headerAction}
            {dismissible && showClose ? (
              <button className="btn btn-subtle btn-icon sheet-close" onClick={onClose} aria-label="Close">
                <Icon name="x" className="icon icon-sm" />
              </button>
            ) : null}
          </div>
        </div>

        <div className="modal-body">{children}</div>

        {footer ? <div className="modal-footer">{footer}</div> : null}
      </div>
    </div>
  );
}
