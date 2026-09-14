module.exports = {
  overrides: [
    {
      exclude: /\/node_modules\//,
      presets: ['module:react-native-builder-bob/babel-preset'],
      // Reanimated's worklets need this transform to exist at all — without it
      // `useAnimatedStyle` throws about a missing dependency array. Metro gets
      // it from babel-preset-expo in the example app; Jest needs it here.
      // It must stay last.
      plugins: ['react-native-worklets/plugin'],
    },
    {
      include: /\/node_modules\//,
      presets: ['module:@react-native/babel-preset'],
    },
  ],
};
