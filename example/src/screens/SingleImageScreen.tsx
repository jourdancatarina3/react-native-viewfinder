import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ZoomableImageRef } from 'react-native-viewfinder';
import { ZoomableImage } from 'react-native-viewfinder';
import { PHOTOS } from '../data/photos';

/**
 * The simplest case: one zoomable image, plus the ref API driving it.
 *
 * The buttons exist to make the imperative handle testable from Maestro,
 * which cannot pinch reliably enough to assert on a scale.
 */
export function SingleImageScreen() {
  const ref = useRef<ZoomableImageRef>(null);
  const [scale, setScale] = useState(1);

  const photo = PHOTOS[0]!;

  return (
    <View style={styles.root}>
      <ZoomableImage
        ref={ref}
        source={photo.source}
        width={photo.width}
        height={photo.height}
        accessibilityLabel={photo.accessibilityLabel}
        onZoomChange={setScale}
        testID="single-image"
        style={styles.image}
      />

      <View style={styles.bar}>
        <Text style={styles.readout} testID="scale-readout">
          {scale.toFixed(2)}×
        </Text>

        <Pressable
          style={styles.button}
          testID="zoom-in"
          accessibilityRole="button"
          onPress={() => ref.current?.zoomTo(scale * 1.5)}
        >
          <Text style={styles.buttonText}>Zoom in</Text>
        </Pressable>

        <Pressable
          style={styles.button}
          testID="zoom-corner"
          accessibilityRole="button"
          onPress={() => ref.current?.zoomTo(3, { focal: { x: 40, y: 40 } })}
        >
          <Text style={styles.buttonText}>Corner</Text>
        </Pressable>

        <Pressable
          style={styles.button}
          testID="reset-zoom"
          accessibilityRole="button"
          onPress={() => ref.current?.reset()}
        >
          <Text style={styles.buttonText}>Reset</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  image: { flex: 1 },
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
    fontSize: 15,
    fontVariant: ['tabular-nums'],
    minWidth: 56,
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
