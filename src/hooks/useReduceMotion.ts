import { ReduceMotion } from 'react-native-reanimated';
import type { ReduceMotionSetting } from '../types';

/**
 * Maps this library's `reduceMotion` prop onto Reanimated's enum.
 *
 * Reanimated reads the OS accessibility setting itself and applies it per
 * animation, so honouring "reduce motion" is a matter of threading the right
 * value into every animation config rather than branching on a boolean. That
 * matters: a competing library has an open bug titled "Reduced motion causes
 * snapping", which is what happens when only *some* of the animations respect
 * the setting.
 *
 * @param setting - `'system'` (default) follows the OS; `'always'` disables
 *   animation outright; `'never'` animates regardless.
 */
export function toReduceMotion(
  setting: ReduceMotionSetting = 'system'
): ReduceMotion {
  switch (setting) {
    case 'always':
      return ReduceMotion.Always;
    case 'never':
      return ReduceMotion.Never;
    case 'system':
    default:
      return ReduceMotion.System;
  }
}
