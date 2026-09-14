import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { GalleryRef } from 'react-native-viewfinder';
import { Gallery } from 'react-native-viewfinder';
import { STRESS } from '../data/photos';

/**
 * 120 images, to show that list size does not affect what is mounted.
 *
 * Only `windowSize` pages either side of the current one exist at any moment,
 * so jumping to image 119 costs the same as opening image 1.
 */
export function StressScreen() {
  const ref = useRef<GalleryRef>(null);
  const [index, setIndex] = useState(0);

  return (
    <View style={styles.root}>
      <Gallery
        ref={ref}
        images={STRESS}
        presentation="inline"
        onIndexChange={setIndex}
        testID="stress-gallery"
        showPageIndicator={false}
      />

      <View style={styles.bar}>
        <Text style={styles.readout} testID="stress-readout">
          {`${index + 1} / ${STRESS.length}`}
        </Text>
        <Pressable
          style={styles.button}
          testID="jump-start"
          accessibilityRole="button"
          onPress={() => ref.current?.goToIndex(0, { animated: false })}
        >
          <Text style={styles.buttonText}>First</Text>
        </Pressable>
        <Pressable
          style={styles.button}
          testID="jump-middle"
          accessibilityRole="button"
          onPress={() => ref.current?.goToIndex(60, { animated: false })}
        >
          <Text style={styles.buttonText}>Middle</Text>
        </Pressable>
        <Pressable
          style={styles.button}
          testID="jump-end"
          accessibilityRole="button"
          onPress={() =>
            ref.current?.goToIndex(STRESS.length - 1, { animated: false })
          }
        >
          <Text style={styles.buttonText}>Last</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    paddingBottom: 28,
    backgroundColor: '#111',
  },
  readout: {
    color: '#7dd3fc',
    fontSize: 14,
    fontVariant: ['tabular-nums'],
    minWidth: 64,
  },
  button: {
    flex: 1,
    backgroundColor: '#1f2937',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontSize: 14 },
});
