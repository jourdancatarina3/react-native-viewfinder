import { GridScreen } from './GridScreen';
import { MIXED_SOURCES } from '../data/photos';

/**
 * Bundled `require()` assets and remote URLs in one gallery.
 *
 * Local assets carry their dimensions in the bundle, so they lay out on the
 * first frame; remote ones without a declared size need a measurement pass.
 * Both are handled by the same code path.
 */
export function MixedSourcesScreen() {
  return <GridScreen images={MIXED_SOURCES} />;
}
