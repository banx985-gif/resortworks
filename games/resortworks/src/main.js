// RESORTWORKS — boot (Milestone 0: project shell + campaign slots + Resort Setup).
// Starts the shared series engine from core/ (renderer, safe areas, fixed-step loop, input, router, assets, debug
// overlay, saves), shows the Banx Games studio splash (core/ui/StudioSplash) while the pictures and saves load, then
// opens the Main Menu: Continue (the last-used slot) · Campaign Slots · New Game · Settings.
// New Game / an empty slot → Resort Setup → START RESORT writes the slot's summary record and an empty campaign save
// (core/CampaignSlots, keys campaign_1 … campaign_4, account store resortworks:account) and opens the placeholder resort
// screen. Starting into an occupied slot asks first, naming the resort it replaces. Settings: the series list
// (core/SeriesSettings + core/ui/SettingsSheet on core/Settings: this device, every resort).
// Add ?debug=1 for the FPS/state overlay and the setup-data check, ?screen=test for the scaling / tap / asset-loader test
// screen. With ?debug=1, &safe=phone|tablet stands in a notch and home bar (safe-area insets) on any screen, and
// &reset=1 empties all four slots.
import { THEME, font, setTextScale } from '../../../core/Theme.js';
import { EventBus } from '../../../core/EventBus.js';
import { Rng } from '../../../core/Rng.js';
import { Renderer } from '../../../core/Renderer.js';
import { UiLayout } from '../../../core/UiLayout.js';
import { Input } from '../../../core/Input.js';
import { ScreenRouter } from '../../../core/ScreenRouter.js';
import { AssetManager } from '../../../core/AssetManager.js';
import { watchCanvasLoss } from '../../../core/CanvasLoss.js';
import { FixedStepLoop } from '../../../core/FixedStepLoop.js';
import { DebugOverlay } from '../../../core/DebugOverlay.js';
import { SystemBack } from '../../../core/SystemBack.js';
import { createStorageAdapter } from '../../../core/StorageAdapter.js';
import { DataValidator } from '../../../core/DataValidator.js';
import { TextPrompt } from '../../../core/ui/TextPrompt.js';
import { BottomSheet } from '../../../core/ui/BottomSheet.js';
import { Dialog } from '../../../core/ui/Modal.js';
import { drawButton, hitRect, setPressPoint, clearPress } from '../../../core/ui/Button.js';
import { Settings } from '../../../core/Settings.js';
import { FrameGovernor } from '../../../core/FrameGovernor.js';
import { Haptics } from '../../../core/Haptics.js';
import { settingsSheet } from '../../../core/ui/SettingsSheet.js';
import { createStudioSplash } from '../../../core/ui/StudioSplash.js';
import { SETTINGS, SETTINGS_DEFAULTS, SETTINGS_KEY, TEXT_SCALE, SETTINGS_TEXT } from '../data/settings.js';
import { ASSETS, STUDIO_LOGO } from '../data/assets.js';
import { SAVE } from '../data/save.js';
import { validateSetup } from '../data/setup.js';
import { createCampaigns } from './app/campaigns.js';
import { createMenuScreen } from './screens/MenuScreen.js';
import { createSlotsScreen } from './screens/SlotsScreen.js';
import { createSetupScreen } from './screens/SetupScreen.js';
import { createResortScreen } from './screens/ResortScreen.js';
import { createTestScreen } from './screens/TestScreen.js';

const COL = THEME.color;

const W = 1080;
const BASE_H = 1920; // 9:16; taller phones grow the height (see Renderer)
const MAX_H = 2640; // up to 9:22 fills edge to edge; taller still gets thin bars top and bottom
const PARAMS = new URLSearchParams(window.location.search);
const START_SCREEN = PARAMS.get('screen') === 'test' ? 'test' : 'menu';
const SAFE_PARAM = PARAMS.get('debug') === '1' ? PARAMS.get('safe') : null;
const FORCE_INSETS = { phone: { top: 47, bottom: 34, left: 0, right: 0 }, tablet: { top: 24, bottom: 20, left: 0, right: 0 } }[SAFE_PARAM] ?? null;

const bus = new EventBus();
const rng = new Rng('resortworks-m0');
const renderer = new Renderer(document.getElementById('game'), { width: W, height: BASE_H, maxHeight: MAX_H, maxDpr: 2, bus });
const layout = new UiLayout(renderer, { forceInsets: FORCE_INSETS });
bus.on('renderer:resize', () => layout.refresh());
const input = new Input(renderer, bus);
const assets = new AssetManager({ bus });
assets.sprites.maxUpscale = 1; // a copy never bigger than its picture (less GPU memory)
watchCanvasLoss(renderer.canvas ?? document.getElementById('game')); // a wiped canvas → the caches are made again
const router = new ScreenRouter(bus, { roots: ['menu', 'test', 'resort'] });
const dialog = new Dialog({ layout, assets }); // confirm boxes (delete / replace a slot)
const sheet = new BottomSheet({ layout, assets });
const textPrompt = new TextPrompt({ renderer });
bus.on('screen:change', () => textPrompt.close());
bus.on('screen:change', () => sheet.close());
bus.on('renderer:resize', () => textPrompt.close());

// Sprites are cached at the screen's real pixel size: remake them when that changes.
assets.setPixelScale(renderer.pixelScale);
bus.on('renderer:resize', () => {
  assets.setPixelScale(renderer.pixelScale);
  debug.top = debugTop();
});

// Pressed button look: any button under a finger that is down.
bus.on('input:down', (p) => setPressPoint(p, renderer.pixelScale));
bus.on('input:up', () => clearPress());
bus.on('input:dragstart', () => clearPress());

const onTestScreen = () => router.currentName === 'test';
let pruneT = 0;
const loop = new FixedStepLoop({
  stepHz: 60,
  bus,
  update: (dt) => {
    if ((pruneT += dt) >= 5) {
      assets.sprites.prune(pruneT, 60); // let go of copies not drawn for a minute
      pruneT = 0;
    }
    router.update(dt);
    dialog.update(dt);
    sheet.update(dt);
  },
  render: (alpha) => {
    const ctx = renderer.begin(COL.bg);
    router.render(ctx, alpha);
    sheet.render(ctx);
    dialog.render(ctx);
    if (onTestScreen()) drawButton(ctx, pauseButton(), loop.paused ? 'RESUME' : 'PAUSE', { selected: loop.paused });
    if (loop.paused) drawPaused(ctx);
    debug.compact = sheet.active || !onTestScreen(); // one FPS line on the menus, the full box on the test screen
    debug.render(ctx);
  },
});
const debugTop = () => layout.safeRect.h - 600;
const debug = new DebugOverlay({ loop, renderer, layout, input, bus, top: debugTop(), maxLines: 3 });
bus.on('loop:pause', () => input.reset());

// The player's settings (core/Settings: this device, every resort — never part of a slot). Graphics / performance:
// core/FrameGovernor (Low = a steady 30 FPS; Auto drops to 30 when the phone struggles). Text size → every font.
// Haptics → core/Haptics. The rest (sound, flashes, shake, Menu button, hints) are saved now and read by the
// milestones that bring what they control.
const settings = new Settings({ key: SETTINGS_KEY, defaults: SETTINGS_DEFAULTS });
const govMode = () => settings.get('fpsMode') ?? 'auto';
const governor = new FrameGovernor({ mode: govMode(), bus, capFps: true });
loop.governor = governor;
const haptics = new Haptics({ enabled: () => settings.get('haptics') !== false });
function applySettings() {
  setTextScale(TEXT_SCALE[settings.get('textSize')] ?? 1);
  if (governor.mode !== govMode()) governor.setMode(govMode());
}
applySettings();
settings.onChange(() => applySettings());
debug.log(`seeded rng check: ${rng.int(0, 9999)} (same every reload)`);

// ---------------------------------------------------------------------------
// Pause: the test screen's button pauses the whole loop (P / Space too); while paused any tap resumes. Hiding the app
// pauses the loop (core).
const pauseButton = () => layout.anchor('top-right', 240, THEME.button.minH, 80);
router.modal = {
  get active() {
    return loop.paused || dialog.active;
  },
  onTap: (p) => (loop.paused ? loop.resume('tap') : dialog.onTap(p)),
  onDown: (p) => dialog.active && dialog.onDown?.(p),
  onUp: (p) => dialog.active && dialog.onUp?.(p),
  onBack: () => (loop.paused ? loop.resume('back') : dialog.onBack()),
};
window.addEventListener('keydown', (e) => {
  if (e.key !== 'p' && e.key !== 'P' && e.key !== ' ') return;
  if (textPrompt.active || dialog.active || !onTestScreen()) return;
  loop.togglePause();
});
function drawPaused(ctx) {
  const H = renderer.height;
  ctx.fillStyle = COL.overlay;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = COL.chip;
  ctx.beginPath();
  ctx.roundRect(W / 2 - 300, H / 2 - 90, 600, 220, THEME.panel.radius);
  ctx.fill();
  ctx.fillStyle = COL.textOnDark;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = font(96, true);
  ctx.fillText('PAUSED', W / 2, H / 2);
  ctx.font = font(THEME.size.body);
  ctx.fillText('tap to resume', W / 2, H / 2 + 80);
}

// The sheet is asked before the screen; the test screen's pause button before both.
router.layers.push(
  {
    get active() {
      return onTestScreen();
    },
    handleInput: (hook, p) => {
      if (hook !== 'onTap' || !hitRect(p, pauseButton())) return false;
      loop.pause('button');
      return true;
    },
  },
  {
    get active() {
      return sheet.active;
    },
    handleInput: (hook, p) => sheet.handleInput(hook, p),
    onBack: () => sheet.onBack(),
  },
);

// Back (phone/browser Back, Esc, "‹ Back"): resume a paused loop, close the dialog / sheet, or go back a screen.
// Returns false at the Main Menu with nothing open, so the next Back leaves the app.
function back() {
  if (loop.paused) {
    loop.resume('back');
    return true;
  }
  return router.back();
}
const systemBack = new SystemBack({ onBack: back });
bus.on('input:up', () => systemBack.rearm()); // re-arm after any tap, in case a Back at the menu let it go

// ---------------------------------------------------------------------------
// The four campaign slots.
let campaigns = null;
let open = null; // { n, data } — the resort on screen
let account = {}; // the account store (core/CampaignSlots): empty until achievements / tokens / NG+ exist

async function prepareSaves() {
  const adapter = await createStorageAdapter({ dbName: SAVE.dbName, prefix: SAVE.localPrefix });
  campaigns = createCampaigns({ adapter, save: SAVE, bus });
  if (debug.enabled && PARAMS.get('reset') === '1') for (const n of campaigns.slots.numbers()) await campaigns.slots.remove(n);
  await campaigns.refresh();
  account = await campaigns.slots.loadAccount();
  settings.attachStore(adapter, 'settings'); // the settings slot in the account database too
  if (debug.enabled) {
    const v = validateSetup(new DataValidator(), { art: true });
    await v.checkArt();
    const r = v.report();
    debug.log(r.ok ? `setup lists: ${r.counts.checks} checks, ${r.counts.art} portraits found` : `setup data: ${r.errors.join('; ')}`);
    if (!r.ok) console.error('[RESORTWORKS] setup data', r.errors);
  }
}
const cards = () => campaigns?.cards ?? [];

// A reload while a resort is open comes back to that resort (this browser tab only).
const RESORT_KEY = 'resortworks:resort';
function rememberResort(n) {
  try {
    if (n) sessionStorage.setItem(RESORT_KEY, String(n));
    else sessionStorage.removeItem(RESORT_KEY);
  } catch {}
}
function resortToResume() {
  try {
    const n = Number(sessionStorage.getItem(RESORT_KEY));
    return n && campaigns?.card(n)?.summary ? n : null;
  } catch {
    return null;
  }
}

async function playSlot(n) {
  let data = null;
  try {
    data = await campaigns.open(n);
  } catch (err) {
    console.error('[RESORTWORKS] could not load slot', n, err);
  }
  if (!data) {
    debug.log(`slot ${n}: nothing to load`);
    await campaigns.refresh();
    router.go('slots', { mode: 'browse' });
    return;
  }
  open = { n, data };
  debug.log(`slot ${n} opened: ${data.resort.name}`);
  rememberResort(n);
  router.go('resort');
}

async function startResort(n, setup) {
  await campaigns.refresh();
  const old = campaigns.card(n);
  const write = async () => {
    const data = await campaigns.start(n, setup);
    open = { n, data };
    debug.log(`new resort in slot ${n}: ${setup.resort}, founder ${setup.founder}`);
    rememberResort(n);
    router.go('resort');
  };
  if (old && !old.empty) {
    const was = old.summary ? `"${old.summary.resort}" (Year ${old.summary.year}, Month ${old.summary.month})` : 'a save that can’t be read';
    dialog.confirm({
      title: `Replace Slot ${n}?`,
      body: `Slot ${n} holds ${was}. Starting "${setup.resort}" here replaces it for good. Your account progress is kept.`,
      yes: 'Replace',
      danger: true,
      onYes: write,
    });
    return;
  }
  await write();
}

function deleteSlot(n) {
  const name = campaigns.card(n)?.summary?.resort;
  dialog.confirm({
    title: `Delete Slot ${n}?`,
    body: name ? `"${name}" will be gone for good. This can't be undone.` : 'This save will be gone for good.',
    yes: 'Delete',
    danger: true,
    onYes: async () => {
      await campaigns.remove(n);
      if (open?.n === n) open = null;
      debug.log(`slot ${n} deleted`);
    },
  });
}

function newGame() {
  const n = campaigns.firstEmpty();
  if (n != null) router.go('setup', { slot: n });
  else router.go('slots', { mode: 'new', note: 'All 4 slots are full. Pick one to replace.' });
}
function setupFor(n) {
  const c = campaigns.card(n);
  router.go('setup', { slot: n, replacing: c?.summary ?? null });
}

const menuScreen = createMenuScreen({
  layout,
  continueInfo: () => {
    const n = campaigns?.last;
    return n ? { n, summary: campaigns.card(n).summary } : null;
  },
  onContinue: (n) => playSlot(n),
  onSlots: () => router.go('slots', { mode: 'browse' }),
  onNewGame: () => newGame(),
  onSettings: () => openSettings(),
});
const slotsScreen = createSlotsScreen({
  layout,
  assets,
  cards,
  last: () => campaigns?.last ?? null,
  onBack: () => router.go('menu'),
  onPlay: (n) => playSlot(n),
  onDelete: (n) => deleteSlot(n),
  onNewInSlot: (n) => setupFor(n),
});
function leaveSetup() {
  const to = router.backTarget;
  router.go(to?.name ?? 'menu', to?.params ?? {});
}
const setupScreen = createSetupScreen({ layout, assets, textPrompt, onBack: () => leaveSetup(), onStart: (n, setup) => startResort(n, setup) });
async function leaveResort() {
  rememberResort(null);
  router.go('menu');
  await campaigns.refresh();
  open = null;
}
const resortScreen = createResortScreen({ renderer, layout, assets, run: () => open, onMenu: () => leaveResort() });

// Settings: the series list in bible §36 order and names, then Help / Privacy / Credits, then the display test.
// Reachable from the Main Menu (always).
function openSettings() {
  const ok = [{ id: 'ok', label: 'OK', accent: COL.progress }];
  sheet.open(() =>
    settingsSheet({
      settings,
      list: SETTINGS,
      text: SETTINGS_TEXT,
      onHelp: () => dialog.show({ title: SETTINGS_TEXT.help, body: SETTINGS_TEXT.helpBody, buttons: ok }),
      onLegal: () => dialog.show({ title: SETTINGS_TEXT.legal, body: SETTINGS_TEXT.legalBody, buttons: ok }),
      onCredits: () => dialog.show({ title: SETTINGS_TEXT.credits, body: SETTINGS_TEXT.creditsBody, buttons: ok }),
      after: [{ id: 'test', label: SETTINGS_TEXT.display, sub: SETTINGS_TEXT.displayLine, accent: COL.progress, onTap: () => router.go('test') }],
    }),
  );
}

// ---------------------------------------------------------------------------
// Boot: the pictures and the saves start loading at once; the studio splash (Banx Games logo, tap to skip) plays
// meanwhile and fades into the Main Menu (or the resort a reload left open, or the test screen).
let booted = false;
const booting = Promise.all([
  assets.loadImages(ASSETS).then((r) => debug.log(`assets: ${r.loaded} loaded, ${r.missing.length} missing`)),
  prepareSaves().catch((err) => console.error('[RESORTWORKS] saves unavailable', err)),
]).then(() => (booted = true));

function firstScreen() {
  const n = START_SCREEN === 'menu' ? resortToResume() : null;
  if (n) playSlot(n);
  else router.go(START_SCREEN);
}
const splashScreen = createStudioSplash({
  renderer,
  assets,
  key: STUDIO_LOGO.key,
  prepare: () => assets.loadImage(STUDIO_LOGO.key, STUDIO_LOGO.src),
  drawNext: (ctx) => {
    if (booted && START_SCREEN === 'menu') return menuScreen.render(ctx);
    ctx.fillStyle = COL.textMuted;
    ctx.font = font(THEME.size.body, true);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Loading…', W / 2, renderer.height / 2);
  },
  onDone: () => booting.then(firstScreen),
});

router
  .register('boot', splashScreen)
  .register('menu', menuScreen)
  .register('slots', slotsScreen)
  .register('setup', setupScreen)
  .register('resort', resortScreen)
  .register('test', createTestScreen({ renderer, layout, assets, openSheet: () => sheet.open(testSheet), onTapLogged: (p) => window.__rw?.taps.push({ x: p.x, y: p.y }) }));

// The Milestone 0 placeholder sheet (test screen).
const testSheet = () => ({
  title: 'Test sheet',
  subtitle: 'Placeholder bottom sheet for Milestone 0.',
  art: 'm0Real',
  sections: [
    {
      lines: ['Close it with ✕, by tapping above it, with Close, or with the phone Back button.'],
      buttons: [
        { id: 'menu', label: 'Main Menu', onTap: () => router.go('menu') },
        { id: 'close', label: 'Close', accent: COL.progress, onTap: () => sheet.close() },
      ],
    },
  ],
});

// ?debug=1: a test hook for automated checks.
if (debug.enabled) {
  window.__rw = { renderer, layout, input, loop, router, assets, sheet, dialog, systemBack, textPrompt, settings, governor, haptics, splashScreen, menuScreen, slotsScreen, setupScreen, resortScreen, playSlot, startResort, deleteSlot, newGame, openSettings, booting, taps: [], get booted() { return booted; }, get account() { return account; }, get campaigns() { return campaigns; }, get open() { return open; } };
}

router.go('boot');
loop.start();
