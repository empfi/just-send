import { useEffect, useLayoutEffect, useRef } from 'react';
import type { ToastKind } from '../types';
import { Icon } from './Icon';

export interface ToastMessage {
  id: number;
  message: string;
  kind: ToastKind;
  leaving?: boolean;
}

const ENTER_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

export function ToastItem({ toast }: { toast: ToastMessage }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element?.animate) return undefined;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const animation = element.animate(
      reduce
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [
            { opacity: 0, transform: 'translateY(-8px) scale(0.98)' },
            { opacity: 1, transform: 'translateY(0) scale(1)' },
          ],
      {
        duration: reduce ? 140 : 220,
        easing: ENTER_EASE,
        fill: 'both',
      }
    );
    return () => animation.cancel();
  }, []);

  useEffect(() => {
    if (!toast.leaving) return undefined;
    const element = ref.current;
    if (!element?.animate) return undefined;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const animation = element.animate(
      reduce
        ? [{ opacity: 1 }, { opacity: 0 }]
        : [
            { opacity: 1, transform: 'translateY(0) scale(1)' },
            { opacity: 0, transform: 'translateY(-8px) scale(0.98)' },
          ],
      {
        duration: reduce ? 140 : 180,
        easing: ENTER_EASE,
        fill: 'forwards',
      }
    );
    return () => animation.cancel();
  }, [toast.leaving]);

  return (
    <div ref={ref} className={`toast toast-${toast.kind}${toast.leaving ? ' is-leaving' : ''}`}>
      <Icon
        name={toast.kind === 'error' ? 'x' : toast.kind === 'info' ? 'link' : 'check'}
        className="icon icon-sm toast-icon"
      />
      <span>{toast.message}</span>
    </div>
  );
}
