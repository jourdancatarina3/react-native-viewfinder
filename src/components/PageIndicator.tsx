import { memo } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

export type PageIndicatorProps = {
  index: number;
  count: number;
  testID?: string;
};

/**
 * The default "3 / 12" counter.
 *
 * Reads as a single string to screen readers rather than three separate nodes,
 * and is hidden entirely for a single-image gallery, where a counter is noise.
 */
function PageIndicatorComponent({ index, count, testID }: PageIndicatorProps) {
  if (count <= 1) {
    return null;
  }

  const label = `${index + 1} of ${count}`;

  return (
    <View style={styles.container} pointerEvents="none">
      <View style={styles.pill}>
        {/* A single interpolated string, not `{index + 1} / {count}`: React
            Native renders the latter as three separate text nodes, which reads
            as three fragments to a screen reader and to UI test runners. */}
        <Text
          style={styles.text}
          accessibilityLabel={label}
          accessibilityRole="text"
          testID={testID}
        >
          {`${index + 1} / ${count}`}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    // Keeps the pill clear of the status bar without depending on
    // react-native-safe-area-context. Custom headers can do better; see the
    // "Safe areas" note in the README.
    paddingTop: Platform.select({ ios: 60, android: 40, default: 24 }),
  },
  pill: {
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  text: {
    color: '#ffffff',
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
});

export const PageIndicator = memo(PageIndicatorComponent);
