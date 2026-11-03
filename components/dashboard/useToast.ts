'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

export type ToastState = { msg: string; bad?: boolean } | null;

// A single toast with an auto-dismiss timer. A newer toast replaces the older
// one and restarts the timer, and the timer is cleared on unmount, so a stale
// timeout can never hide a newer message or fire after the component is gone.
export function useToast(defaultMs = 2600) {
  const [toast, setToast] = useState<ToastState>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const showToast = useCallback(
    (msg: string, bad = false, ms = defaultMs) => {
      clear();
      setToast({ msg, bad });
      timer.current = setTimeout(() => setToast(null), ms);
    },
    [clear, defaultMs],
  );

  useEffect(() => clear, [clear]);

  return { toast, showToast };
}
