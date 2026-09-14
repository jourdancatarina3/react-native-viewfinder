import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Gallery } from 'react-native-viewfinder';
import { UNRELIABLE } from '../data/photos';

/**
 * Dead hosts, 404s and slow responses.
 *
 * The first image loads normally so you can compare; the rest exercise the
 * error and loading paths, including the custom slots that replace them.
 */
export function UnreliableScreen() {
  return (
    <Gallery
      images={UNRELIABLE}
      presentation="inline"
      testID="unreliable-gallery"
      renderLoading={({ index }) => (
        <View style={styles.centre}>
          <Text style={styles.muted} testID={`loading-${index}`}>
            Loading photo {index + 1}…
          </Text>
        </View>
      )}
      renderError={({ index, retry }) => (
        <View style={styles.centre}>
          <Text style={styles.error} testID={`error-${index}`}>
            {`Could not load photo ${index + 1}`}
          </Text>
          <Pressable
            onPress={retry}
            testID={`retry-${index}`}
            accessibilityRole="button"
            style={styles.retry}
          >
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  centre: { alignItems: 'center', gap: 14, padding: 24 },
  muted: { color: '#9ca3af', fontSize: 15 },
  error: { color: '#fca5a5', fontSize: 15, textAlign: 'center' },
  retry: {
    backgroundColor: '#1f2937',
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  retryText: { color: '#fff', fontSize: 14 },
});
