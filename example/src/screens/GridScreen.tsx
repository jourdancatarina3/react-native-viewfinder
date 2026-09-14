import { useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import type { GalleryImage } from 'react-native-viewfinder';
import { Gallery } from 'react-native-viewfinder';
import { PHOTOS, thumbnailFor } from '../data/photos';

/**
 * The flow most apps actually want: a thumbnail grid that opens a full-screen
 * gallery at the tapped photo.
 *
 * This is the "under five minutes" integration from the README, verbatim —
 * a piece of state, a grid, and three props on `<Gallery>`.
 */
export function GridScreen({ images = PHOTOS }: { images?: GalleryImage[] }) {
  const [index, setIndex] = useState<number | null>(null);
  const { width } = useWindowDimensions();
  const columns = width > 600 ? 4 : 3;
  const size = (width - 8 * (columns + 1)) / columns;

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.grid}>
        {images.map((item, i) => (
          <Pressable
            key={i}
            testID={`thumb-${i}`}
            accessibilityRole="imagebutton"
            accessibilityLabel={item.accessibilityLabel ?? `Photo ${i + 1}`}
            onPress={() => setIndex(i)}
            style={({ pressed }) => [
              { width: size, height: size, opacity: pressed ? 0.6 : 1 },
              styles.cell,
            ]}
          >
            <Image
              source={{ uri: thumbnailFor(item) }}
              style={styles.thumb}
              resizeMode="cover"
            />
          </Pressable>
        ))}
      </ScrollView>

      <Gallery
        images={images}
        visible={index !== null}
        initialIndex={index ?? 0}
        onClose={() => setIndex(null)}
        testID="grid-gallery"
        renderFooter={({ item, index: i, count, close }) => (
          <View style={styles.footer}>
            <Text style={styles.caption} numberOfLines={2}>
              {item?.accessibilityLabel ?? `Photo ${i + 1}`}
            </Text>
            <Pressable
              onPress={close}
              testID="gallery-close"
              accessibilityRole="button"
              accessibilityLabel="Close gallery"
              style={styles.closeButton}
            >
              <Text style={styles.closeText}>
                Close ({i + 1}/{count})
              </Text>
            </Pressable>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b0b0d' },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    padding: 8,
  },
  cell: { borderRadius: 10, overflow: 'hidden', backgroundColor: '#1a1a1f' },
  thumb: { width: '100%', height: '100%' },
  footer: {
    padding: 20,
    paddingBottom: 44,
    gap: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  caption: { color: '#e5e7eb', fontSize: 14, lineHeight: 20 },
  closeButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#1f2937',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  closeText: { color: '#fff', fontSize: 14 },
});
