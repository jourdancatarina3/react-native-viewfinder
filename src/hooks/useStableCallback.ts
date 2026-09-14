import { useCallback, useInsertionEffect, useRef } from 'react';

/**
 * Wraps a possibly-changing callback in one whose identity never changes.
 *
 * Gesture callbacks are built once and then live on the UI thread, so anything
 * they capture is captured for good. Passing a user's handler in directly means
 * a re-render that swaps the handler leaves the gesture calling the old one —
 * the classic "my onTap uses stale state" bug. Routing through a ref keeps the
 * worklet's captured reference stable while always invoking the latest handler.
 *
 * `useInsertionEffect` rather than `useEffect` so the ref is current before any
 * layout effect or animation callback can fire in the same commit.
 */
export function useStableCallback<Args extends unknown[], R>(
  callback: ((...args: Args) => R) | undefined
): (...args: Args) => R | undefined {
  const ref = useRef(callback);

  useInsertionEffect(() => {
    ref.current = callback;
  }, [callback]);

  return useCallback((...args: Args) => ref.current?.(...args), []);
}
