import { fixupConfigRules } from '@eslint/compat';
import { FlatCompat } from '@eslint/eslintrc';
import js from '@eslint/js';
import prettier from 'eslint-plugin-prettier';
import { defineConfig } from 'eslint/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

export default defineConfig([
  {
    extends: fixupConfigRules(compat.extends('@react-native', 'prettier')),
    plugins: { prettier },
    rules: {
      'react/react-in-jsx-scope': 'off',
      'prettier/prettier': 'error',
    },
  },
  {
    // The Gesture Handler adapter deliberately violates two hook rules, and it
    // is the only file in the project allowed to. See docs/DECISIONS.md D-003.
    //
    // `rules-of-hooks`: the v2 branch calls `useMemo` inside plain functions
    // that ESLint cannot see are only ever invoked from the exported `useX`
    // wrappers. The v3 branch calls RGH's own hooks through a namespace object,
    // which ESLint also cannot follow. Both are hooks called unconditionally
    // from hooks — the rule simply cannot prove it.
    //
    // `exhaustive-deps`: gesture configs carry worklet callbacks that are new
    // objects on every render. Depending on them would rebuild the gesture each
    // frame, which is exactly what RGH tells you not to do. Configs are read
    // once, at mount, which is the documented contract of the exported hooks.
    files: ['src/compat/gestures.ts'],
    rules: {
      'react-hooks/rules-of-hooks': 'off',
      'react-hooks/exhaustive-deps': 'off',
    },
  },
  {
    files: ['jest/**/*.js', '**/__tests__/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        jest: 'readonly',
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
      },
    },
  },
  {
    ignores: ['node_modules/', 'lib/', 'coverage/', 'example/node_modules/'],
  },
]);
