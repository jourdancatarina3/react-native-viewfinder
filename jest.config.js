/** @type {import('jest').Config} */
module.exports = {
  preset: '@react-native/jest-preset',
  resolver: '<rootDir>/jest/resolver.js',
  setupFiles: ['<rootDir>/jest/setup.js'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  testMatch: ['<rootDir>/src/**/__tests__/**/*.test.{ts,tsx}'],
  transformIgnorePatterns: [
    'node_modules/(?!(?:.pnpm/)?(@?react-native|@react-native-community|expo|expo-.*|@expo/.*|react-native-reanimated|react-native-gesture-handler|react-native-worklets|react-native-safe-area-context)/)',
  ],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/__tests__/**',
    '!src/**/*.d.ts',
    '!src/index.tsx',
  ],
  coverageReporters: ['text', 'text-summary', 'lcov', 'json-summary'],
};
