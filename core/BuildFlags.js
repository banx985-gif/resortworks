// Build flags baked into a game's one-file bundle by tools/bundle-game.mjs (esbuild `define`), for any series game.
// A store release build (tools/build-android.ps1 -Release → bundle-game.mjs --release) sets RELEASE: debug panels,
// test screens, test hooks and cheats stay off whatever the page address says (?debug=1 does nothing). Local runs,
// the published web build and the debug APK are not release builds, so they behave exactly as before.
/* global __CMS_RELEASE__ */
export const RELEASE = typeof __CMS_RELEASE__ !== 'undefined' && __CMS_RELEASE__ === true;
