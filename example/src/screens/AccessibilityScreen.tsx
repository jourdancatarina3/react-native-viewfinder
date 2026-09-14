import { useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import type { ReduceMotionSetting } from 'react-native-viewfinder';
import { Gallery } from 'react-native-viewfinder';
import { PHOTOS } from '../data/photos';

/**
 * Reduced motion and screen-reader behaviour.
 *
 * The toggle forces the setting so you can feel the difference without going
 * into system settings; leaving it off follows the OS, which is the default.
 * Every image here carries an `accessibilityLabel`, and the page indicator
 * reads as "3 of 6" rather than as three separate nodes.
 */
export function AccessibilityScreen() {
  const [forced, setForced] = useState(false);
  const [systemSetting, setSystemSetting] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setSystemSetting);
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setSystemSetting
    );
    return () => subscription.remove();
  }, []);

  const reduceMotion: ReduceMotionSetting = forced ? 'always' : 'system';

  return (
    <View style={styles.root}>
      <View style={styles.bar}>
        <Text style={styles.label}>
          Force reduced motion{'\n'}
          <Text style={styles.hint}>
            System setting is currently {systemSetting ? 'on' : 'off'}
          </Text>
        </Text>
        <Switch
          value={forced}
          onValueChange={setForced}
          testID="reduce-motion-toggle"
          accessibilityLabel="Force reduced motion"
        />
      </View>

      <Gallery
        images={PHOTOS}
        presentation="inline"
        reduceMotion={reduceMotion}
        doubleTapMaxDelay={700}
        testID="a11y-gallery"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    padding: 16,
    paddingTop: 56,
    backgroundColor: '#111',
  },
  label: { color: '#e5e7eb', fontSize: 15, flex: 1 },
  hint: { color: '#9ca3af', fontSize: 13 },
});
