// Reanimated ships a Jest mock that emulates shared values and animations on the
// JS thread. Without it, every `useSharedValue` call throws.
require('react-native-reanimated').setUpTests?.();

// Gesture Handler's jest setup registers the native module shims.
require('react-native-gesture-handler/jestSetup');

// `expo-image` is an optional peer. Tests that need it mock it explicitly; here we
// make sure the *absence* path is what runs by default, matching a bare RN app.
jest.mock('expo-image', () => {
  throw new Error('expo-image not installed');
});

// Silence the noisy "not wrapped in act(...)" warnings that Reanimated's mock
// produces when animations settle outside of React's test scheduler.
const originalError = console.error;
console.error = (...args) => {
  if (typeof args[0] === 'string' && args[0].includes('not wrapped in act')) {
    return;
  }
  originalError(...args);
};
