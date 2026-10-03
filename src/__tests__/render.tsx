import { render as baseRender } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

/**
 * Renders inside a `GestureHandlerRootView`, as every app using this library
 * must. Gesture Handler 3's `GestureDetector` throws without one; v2 never
 * checked, which is why the suite got away without it until it ran on v3.
 */
export function render(
  ui: ReactElement,
  options?: Parameters<typeof baseRender>[1]
) {
  return baseRender(ui, { wrapper: GestureHandlerRootView, ...options });
}
