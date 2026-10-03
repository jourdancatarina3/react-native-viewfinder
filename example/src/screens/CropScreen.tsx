import { Image } from 'expo-image';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type {
  CropResult,
  ImageCropperRef,
} from 'react-native-image-viewfinder';
import { ImageCropper } from 'react-native-image-viewfinder';
import { applyCrop } from 'react-native-image-viewfinder/expo-image-manipulator';
import { PHOTOS } from '../data/photos';

const PHOTO = PHOTOS[0]!;
const URI = PHOTO.source as string;

/**
 * Cropping, end to end.
 *
 * `<ImageCropper>` reports geometry only — a rectangle in the source image's
 * own pixels plus the rotation and flips. Turning that into a file is one call
 * to `applyCrop`, which is a thin wrapper over `expo-image-manipulator`; the
 * cropper itself has no dependency on it.
 */
export function CropScreen() {
  const cropper = useRef<ImageCropperRef>(null);
  const [region, setRegion] = useState<CropResult | null>(null);
  const [output, setOutput] = useState<{
    uri: string;
    width: number;
    height: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function crop() {
    const result = cropper.current?.getResult();
    if (!result) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const saved = await applyCrop(URI, result, { compress: 0.9 });
      setOutput({ uri: saved.uri, width: saved.width, height: saved.height });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  if (output) {
    return (
      <View style={styles.root}>
        <View style={styles.resultStage}>
          <Image
            source={{ uri: output.uri }}
            style={styles.resultImage}
            contentFit="contain"
            testID="crop-output"
          />
        </View>
        <View style={styles.bar}>
          <Text style={styles.readout} testID="crop-output-size">
            {`${output.width}×${output.height}`}
          </Text>
          <Pressable
            style={styles.button}
            testID="crop-again"
            accessibilityRole="button"
            onPress={() => setOutput(null)}
          >
            <Text style={styles.buttonText}>Crop again</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ImageCropper
        ref={cropper}
        source={URI}
        width={PHOTO.width}
        height={PHOTO.height}
        accessibilityLabel={PHOTO.accessibilityLabel}
        aspectRatio="free"
        onCropChange={setRegion}
        ImageComponent={Image}
        testID="cropper"
      />

      <View style={styles.bar}>
        <Text style={styles.readout} testID="crop-readout">
          {region ? `${region.crop.width}×${region.crop.height}` : 'measuring…'}
        </Text>
        {error ? (
          <Text style={styles.error} numberOfLines={1} testID="crop-error">
            {error}
          </Text>
        ) : null}
        <Pressable
          style={styles.button}
          testID="crop-apply"
          accessibilityRole="button"
          accessibilityLabel="Apply crop"
          onPress={crop}
          disabled={busy || !region}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Crop</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  resultStage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  resultImage: { width: '100%', height: '100%' },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    paddingBottom: 30,
    backgroundColor: '#111114',
  },
  readout: {
    color: '#7dd3fc',
    fontSize: 14,
    fontVariant: ['tabular-nums'],
    minWidth: 96,
  },
  error: { color: '#fca5a5', fontSize: 12, flex: 1 },
  button: {
    marginLeft: 'auto',
    minWidth: 104,
    alignItems: 'center',
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 11,
    paddingHorizontal: 20,
  },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
