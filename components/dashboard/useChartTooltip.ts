'use client';
import { useEffect } from 'react';

// Floating tooltip for [data-tip] elements: follows the mouse, and mirrors the
// same lookup on tap because touchscreens never fire mousemove. The element is
// created on mount and its listeners and node are removed on unmount.
export function useChartTooltip(): void {
  useEffect(() => {
    const tip = document.createElement('div');
    tip.id = 'tip';
    tip.style.display = 'none';
    document.body.appendChild(tip);
    const showAt = (t: HTMLElement, x: number, y: number) => {
      tip.textContent = t.getAttribute('data-tip') || '';
      tip.style.display = 'block';
      tip.style.left = Math.min(x + 14, window.innerWidth - tip.offsetWidth - 12) + 'px';
      tip.style.top = Math.min(y + 16, window.innerHeight - tip.offsetHeight - 12) + 'px';
    };
    const move = (e: MouseEvent) => {
      const t = (e.target as HTMLElement).closest('[data-tip]') as HTMLElement | null;
      if (!t) {
        tip.style.display = 'none';
        return;
      }
      showAt(t, e.clientX, e.clientY);
    };
    const tap = (e: TouchEvent) => {
      const touch = e.touches[0];
      const el = touch ? (document.elementFromPoint(touch.clientX, touch.clientY) as HTMLElement | null) : null;
      const t = el?.closest('[data-tip]') as HTMLElement | null;
      if (t) showAt(t, touch.clientX, touch.clientY);
      else tip.style.display = 'none';
    };
    const hide = () => (tip.style.display = 'none');
    document.addEventListener('mousemove', move);
    document.addEventListener('touchstart', tap, { passive: true });
    document.addEventListener('scroll', hide, true);
    return () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('touchstart', tap);
      document.removeEventListener('scroll', hide, true);
      tip.remove();
    };
  }, []);
}
