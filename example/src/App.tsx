import { useState } from 'react';
import type { ComponentType } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { HAS_HOOK_GESTURE_API } from 'react-native-viewfinder';
import { AccessibilityScreen } from './screens/AccessibilityScreen';
import { AspectRatiosScreen } from './screens/AspectRatiosScreen';
import { ExpoImageScreen } from './screens/ExpoImageScreen';
import { GridScreen } from './screens/GridScreen';
import { MixedSourcesScreen } from './screens/MixedSourcesScreen';
import { SingleImageScreen } from './screens/SingleImageScreen';
import { StressScreen } from './screens/StressScreen';
import { UnreliableScreen } from './screens/UnreliableScreen';

type Demo = {
  id: string;
  title: string;
  blurb: string;
  Screen: ComponentType;
};

const DEMOS: Demo[] = [
  {
    id: 'single',
    title: 'Single zoomable image',
    blurb: 'Pinch, pan, double-tap. Plus the ref API.',
    Screen: SingleImageScreen,
  },
  {
    id: 'grid',
    title: 'Grid → gallery',
    blurb: 'The flow most apps want. Tap a thumbnail to open.',
    Screen: GridScreen,
  },
  {
    id: 'aspect',
    title: 'Aspect ratios',
    blurb: 'Panorama, column, 8000px, and a single pixel.',
    Screen: AspectRatiosScreen,
  },
  {
    id: 'mixed',
    title: 'Local + remote sources',
    blurb: 'require() assets and URLs in one gallery.',
    Screen: MixedSourcesScreen,
  },
  {
    id: 'unreliable',
    title: 'Loading & errors',
    blurb: 'Dead hosts, 404s, slow responses, custom slots.',
    Screen: UnreliableScreen,
  },
  {
    id: 'stress',
    title: '120 images',
    blurb: 'Only the windowed pages are ever mounted.',
    Screen: StressScreen,
  },
  {
    id: 'expo-image',
    title: 'expo-image + blurhash',
    blurb: 'One extra prop buys progressive decoding.',
    Screen: ExpoImageScreen,
  },
  {
    id: 'a11y',
    title: 'Accessibility',
    blurb: 'Reduced motion and screen-reader labels.',
    Screen: AccessibilityScreen,
  },
];

export default function App() {
  const [active, setActive] = useState<Demo | null>(null);

  return (
    <GestureHandlerRootView style={styles.root}>
      <StatusBar barStyle="light-content" />
      {active ? (
        <View style={styles.root}>
          <View style={styles.navbar}>
            <Pressable
              onPress={() => setActive(null)}
              testID="back"
              accessibilityRole="button"
              accessibilityLabel="Back to the demo list"
              style={styles.back}
            >
              <Text style={styles.backText}>‹ Demos</Text>
            </Pressable>
            <Text style={styles.navTitle} numberOfLines={1}>
              {active.title}
            </Text>
          </View>
          <View style={styles.root}>
            <active.Screen />
          </View>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          <Text style={styles.heading}>Viewfinder</Text>
          <Text style={styles.sub}>
            Gesture Handler{' '}
            <Text style={styles.strong}>
              {HAS_HOOK_GESTURE_API ? 'v3 hook API' : 'v2 builder API'}
            </Text>
            {' · '}
            {Platform.OS} {String(Platform.Version)}
          </Text>

          {DEMOS.map((demo) => (
            <Pressable
              key={demo.id}
              testID={`demo-${demo.id}`}
              accessibilityRole="button"
              onPress={() => setActive(demo)}
              style={({ pressed }) => [styles.card, pressed && styles.pressed]}
            >
              <Text style={styles.cardTitle}>{demo.title}</Text>
              <Text style={styles.cardBlurb}>{demo.blurb}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b0b0d' },
  list: { padding: 16, paddingTop: 72, gap: 10 },
  heading: { color: '#fff', fontSize: 30, fontWeight: '700' },
  sub: { color: '#9ca3af', fontSize: 13, marginBottom: 14 },
  strong: { color: '#7dd3fc' },
  card: {
    backgroundColor: '#17171c',
    borderRadius: 12,
    padding: 16,
    gap: 4,
  },
  pressed: { opacity: 0.6 },
  cardTitle: { color: '#f3f4f6', fontSize: 16, fontWeight: '600' },
  cardBlurb: { color: '#9ca3af', fontSize: 13, lineHeight: 18 },
  navbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 56,
    paddingHorizontal: 12,
    paddingBottom: 10,
    backgroundColor: '#111',
  },
  back: { paddingVertical: 4, paddingRight: 8 },
  backText: { color: '#7dd3fc', fontSize: 16 },
  navTitle: { color: '#e5e7eb', fontSize: 16, flex: 1 },
});
