import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards the one invariant that unit tests otherwise cannot see.
 *
 * `geometry.ts`, `zoom.ts` and `pan.ts` are called from gesture callbacks,
 * which run on Reanimated's UI runtime. Every function in them therefore needs
 * a `'worklet'` directive so the Babel plugin compiles it for that runtime.
 *
 * Miss one and **nothing fails in Jest** — there is only one thread there, so
 * a plain function is called happily. On a device the worklet throws
 * "Tried to synchronously call a Remote Function", the gesture callback dies
 * mid-way, and the interaction silently does nothing.
 *
 * That is not hypothetical: `isUsableSize` shipped without its directive and
 * broke pinch, pan bounds and double-tap on device while all 239 unit tests
 * stayed green. This test is the regression guard.
 */

const UI_THREAD_MODULES = ['geometry.ts', 'zoom.ts', 'pan.ts'];

/**
 * `normalize.ts` is deliberately *not* in that list: it runs during render, on
 * the JS thread, and handles strings and objects that cannot cross to a
 * worklet anyway.
 */
const JS_ONLY_MODULES = ['normalize.ts'];

type ExportedFunction = { name: string; hasDirective: boolean };

function exportedFunctions(fileName: string): ExportedFunction[] {
  const source = readFileSync(join(__dirname, '..', fileName), 'utf8');
  const pattern = /export function (\w+)[\s\S]*?\{\n\s*(.*)/g;
  const found: ExportedFunction[] = [];

  let match = pattern.exec(source);
  while (match !== null) {
    found.push({
      name: match[1]!,
      hasDirective: match[2]!.trim().startsWith("'worklet'"),
    });
    match = pattern.exec(source);
  }
  return found;
}

describe('worklet directives', () => {
  it.each(UI_THREAD_MODULES)(
    'every exported function in %s is a worklet',
    (fileName) => {
      const functions = exportedFunctions(fileName);

      // Guard against the regex silently matching nothing and the test
      // passing vacuously.
      expect(functions.length).toBeGreaterThan(0);

      const missing = functions
        .filter((fn) => !fn.hasDirective)
        .map((fn) => fn.name);

      expect(missing).toEqual([]);
    }
  );

  it.each(JS_ONLY_MODULES)(
    '%s stays JS-only, so it is never called from a gesture callback',
    (fileName) => {
      const functions = exportedFunctions(fileName);
      expect(functions.length).toBeGreaterThan(0);
      // Not an error if one gains a directive, but it should be a deliberate
      // move into UI_THREAD_MODULES rather than an accident.
      expect(functions.every((fn) => !fn.hasDirective)).toBe(true);
    }
  );
});
