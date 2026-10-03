// Reanimated 4.6 split several modules into a `.native.js` file, which calls
// Worklets APIs that only exist on a device, and a plain `.js` file, which
// carries the Jest branch. Worklets' resolver only redirects Worklets itself, so
// on 4.6 Jest loaded the native half and every suite died on import with
// "`createShareable` is not supported on web".
//
// Reanimated 4.7 ships a resolver that picks the plain files; use it when it is
// there. On 4.6 apply the same rule here. On 4.5 and earlier those modules have
// no native half, so the rule is a no-op and older peers resolve as before.

let resolver;
try {
  resolver = require('react-native-reanimated/jest/resolver');
} catch {
  const workletsResolver = require('react-native-worklets/jest/resolver');

  // Mirrors the list in react-native-reanimated@4.7's jest/resolver.js.
  const WEB_ONLY_IN_JEST = new Set([
    'initializers',
    'mutables',
    'mappers',
    'ConfigHelper',
    'UpdateLayoutAnimations',
    'useAnimatedRef',
    'useAnimatedStyle',
    'WorkletEventHandler',
    'JSPropsUpdater',
    'updateProps',
    'util',
    'css/component/AnimatedComponent',
  ]);

  /** @type {import('jest-resolve').SyncResolver} */
  resolver = (request, options) => {
    const basename = request.split('/').pop();
    const isWebOnly = [...WEB_ONLY_IN_JEST].some((entry) =>
      entry.includes('/') ? request.endsWith(entry) : basename === entry
    );
    if (
      request.startsWith('.') &&
      isWebOnly &&
      options.basedir.includes('react-native-reanimated')
    ) {
      return options.defaultResolver(request, {
        ...options,
        extensions: options.extensions?.filter(
          (ext) => !ext.includes('native')
        ),
      });
    }
    return workletsResolver(request, options);
  };
}

module.exports = resolver;
