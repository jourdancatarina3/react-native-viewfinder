import { memo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { AspectRatio } from '../core/crop';
import { ASPECT_PRESETS } from '../core/crop';

export type CropToolbarProps = {
  aspectRatio: AspectRatio;
  onAspectRatioChange: (aspect: AspectRatio) => void;
  onRotate: () => void;
  onFlipHorizontal: () => void;
  onFlipVertical: () => void;
  onReset: () => void;
  /** Presets to offer. Defaults to {@link ASPECT_PRESETS}. */
  presets?: readonly { label: string; value: AspectRatio }[];
  /** Hides the ratio row for a fixed-ratio cropper. */
  showAspectRatios?: boolean;
  testID?: string;
};

/**
 * The default crop controls: a scrollable row of ratio chips, and buttons for
 * rotating, flipping and resetting.
 *
 * Supplied as a whole component rather than as a pile of props because the
 * layout of a crop toolbar is a solved problem — and because replacing it
 * entirely (via `renderToolbar`) is easier to reason about than overriding it
 * piece by piece.
 */
function CropToolbarComponent({
  aspectRatio,
  onAspectRatioChange,
  onRotate,
  onFlipHorizontal,
  onFlipVertical,
  onReset,
  presets = ASPECT_PRESETS,
  showAspectRatios = true,
  testID,
}: CropToolbarProps) {
  return (
    <View style={styles.root} testID={testID}>
      {showAspectRatios ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
          testID={testID ? `${testID}-aspects` : undefined}
        >
          {presets.map((preset) => {
            const selected = isSame(preset.value, aspectRatio);
            return (
              <Pressable
                key={preset.label}
                onPress={() => onAspectRatioChange(preset.value)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`Aspect ratio ${preset.label}`}
                testID={testID ? `${testID}-aspect-${preset.label}` : undefined}
                style={({ pressed }) => [
                  styles.chip,
                  selected && styles.chipSelected,
                  pressed && styles.pressed,
                ]}
              >
                <Text
                  style={[styles.chipText, selected && styles.chipTextSelected]}
                >
                  {preset.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      <View style={styles.actions}>
        <ToolButton
          label="Rotate"
          glyph="⟲︎"
          onPress={onRotate}
          testID={testID ? `${testID}-rotate` : undefined}
        />
        <ToolButton
          label="Flip horizontally"
          short="Flip ↔︎"
          glyph="⇄︎"
          onPress={onFlipHorizontal}
          testID={testID ? `${testID}-flip-h` : undefined}
        />
        <ToolButton
          label="Flip vertically"
          short="Flip ↕︎"
          glyph="⇅︎"
          onPress={onFlipVertical}
          testID={testID ? `${testID}-flip-v` : undefined}
        />
        <ToolButton
          label="Reset"
          glyph="↺︎"
          onPress={onReset}
          testID={testID ? `${testID}-reset` : undefined}
        />
      </View>
    </View>
  );
}

function ToolButton({
  label,
  short,
  glyph,
  onPress,
  testID,
}: {
  /** Read by screen readers; must be unambiguous on its own. */
  label: string;
  /** Shown under the glyph. Defaults to the first word of `label`. */
  short?: string;
  glyph: string;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      // A generous hit area: these sit at the bottom of the screen where
      // thumbs are least precise.
      hitSlop={8}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <Text style={styles.glyph}>{glyph}</Text>
      <Text style={styles.buttonLabel} numberOfLines={1}>
        {short ?? label.split(' ')[0]}
      </Text>
    </Pressable>
  );
}

/** Ratio equality that tolerates the float from `4 / 5`. */
function isSame(a: AspectRatio, b: AspectRatio): boolean {
  if (typeof a === 'number' && typeof b === 'number') {
    return Math.abs(a - b) < 1e-6;
  }
  return a === b;
}

const styles = StyleSheet.create({
  root: {
    gap: 14,
    paddingVertical: 14,
    backgroundColor: '#111114',
  },
  chips: {
    paddingHorizontal: 14,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: '#24242b',
  },
  chipSelected: {
    backgroundColor: '#ffffff',
  },
  chipText: {
    color: '#d4d4d8',
    fontSize: 13,
    fontWeight: '500',
  },
  chipTextSelected: {
    color: '#111114',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 14,
  },
  button: {
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 12,
    paddingVertical: 4,
    minWidth: 64,
  },
  buttonLabel: {
    color: '#9ca3af',
    fontSize: 11,
  },
  glyph: {
    color: '#ffffff',
    fontSize: 20,
    lineHeight: 24,
  },
  // Arrow glyphs default to colour-emoji presentation on iOS, which looks
  // wrong next to the monochrome labels. U+FE0E on each glyph forces the text
  // form; see the `short` and `glyph` strings above.
  pressed: {
    opacity: 0.55,
  },
});

export const CropToolbar = memo(CropToolbarComponent);
