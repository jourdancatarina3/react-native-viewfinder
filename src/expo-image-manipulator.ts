/**
 * Turns a {@link CropResult} into an actual image file, using
 * `expo-image-manipulator`.
 *
 * ```tsx
 * import { applyCrop } from 'react-native-viewfinder/expo-image-manipulator';
 *
 * const result = cropperRef.current?.getResult();
 * if (result) {
 *   const { uri, width, height } = await applyCrop(sourceUri, result);
 * }
 * ```
 *
 * A separate entry point rather than part of the main export, for the same
 * reason as `react-native-viewfinder/expo-image`: Metro resolves imports when
 * it bundles, so a guarded `require` of an optional dependency either breaks
 * the build for apps without it or never resolves for apps with it. Importing
 * this path is the opt-in. See docs/DECISIONS.md D-009.
 *
 * `<ImageCropper>` itself has no dependency on this — it reports geometry and
 * nothing more, so it works with `@react-native-community/image-editor`, a
 * server-side pipeline, or anything else you prefer.
 */
import { FlipType, ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import type { ImageResult, SaveOptions } from 'expo-image-manipulator';
import { isFullFrame } from './core/crop';
import type { CropResult } from './core/crop';

export type ApplyCropOptions = {
  /** Output format. Defaults to JPEG. */
  format?: SaveFormat;
  /** 0–1, where 1 is no compression. Defaults to 0.9. */
  compress?: number;
  /** Also return the image as a base64 string. */
  base64?: boolean;
  /** Resize the result after cropping. One axis may be omitted. */
  resize?: { width?: number; height?: number };
};

/**
 * Applies a crop result to an image and saves the output.
 *
 * The operations are applied in the order the result documents — **rotate,
 * then flip, then crop** — because the crop rectangle is expressed in the
 * coordinates of the already-rotated, already-flipped image. Applying them in
 * any other order silently crops the wrong region.
 *
 * @param uri - the source image
 * @param result - from `ImageCropperRef.getResult()`
 */
export async function applyCrop(
  uri: string,
  result: CropResult,
  options: ApplyCropOptions = {}
): Promise<ImageResult> {
  const {
    format = SaveFormat.JPEG,
    compress = 0.9,
    base64 = false,
    resize,
  } = options;

  let context = ImageManipulator.manipulate(uri);

  if (result.rotate !== 0) {
    context = context.rotate(result.rotate);
  }
  if (result.flipHorizontal) {
    context = context.flip(FlipType.Horizontal);
  }
  if (result.flipVertical) {
    context = context.flip(FlipType.Vertical);
  }

  // Skip a pointless decode-and-re-encode when the user framed the whole image
  // and did not rotate or flip it.
  const untouched =
    result.rotate === 0 &&
    !result.flipHorizontal &&
    !result.flipVertical &&
    isFullFrame(result.crop, result.sourceSize);

  if (!untouched) {
    context = context.crop(result.crop);
  }

  if (resize) {
    context = context.resize(resize);
  }

  const rendered = await context.renderAsync();
  const saveOptions: SaveOptions = { format, compress, base64 };
  return rendered.saveAsync(saveOptions);
}

/**
 * The manipulator actions a crop result corresponds to, without running them.
 *
 * Useful when you already have a manipulator pipeline of your own and want to
 * splice these in, or when you need to send the operations somewhere else to
 * be applied.
 */
export function cropActions(result: CropResult) {
  const actions: Record<string, unknown>[] = [];
  if (result.rotate !== 0) {
    actions.push({ rotate: result.rotate });
  }
  if (result.flipHorizontal) {
    actions.push({ flip: FlipType.Horizontal });
  }
  if (result.flipVertical) {
    actions.push({ flip: FlipType.Vertical });
  }
  actions.push({ crop: result.crop });
  return actions;
}

export { FlipType, SaveFormat };
export type { ImageResult };
