// RESORTWORKS — boot (Milestone 0: project shell + campaign slots + Resort Setup).
// Starts the shared series engine from core/ (renderer, safe areas, fixed-step loop, input, router, assets, debug
// overlay, saves), shows the Banx Games studio splash (core/ui/StudioSplash) while the pictures and saves load, then
// opens the Main Menu: Continue (the last-used slot) · Campaign Slots · New Game · Settings.
// New Game / an empty slot → Resort Setup → START RESORT writes the slot's summary record and an empty campaign save
// (core/CampaignSlots, keys campaign_1 … campaign_4, account store resortworks:account) and opens the placeholder resort
// screen. Starting into an occupied slot asks first, naming the resort it replaces. Settings: the series list
// (core/SeriesSettings + core/ui/SettingsSheet on core/Settings: this device, every resort).
// Milestone 1: START RESORT / Continue / Play open the Resort Hub (src/screens/ResortScreen.js): the Roadside Lot in the
// 3/4 view with the eight starting facilities and two rooms, the guest and the Founder walking their loops
// (src/systems/resortWorld.js), pan / pinch / wheel zoom, sheets on tap (and from the Reception shortcut), and the
// placeholder Build Mode on a long press. A reload while the hub is open comes back to it (positions start fresh).
// Milestone 2: each open resort has its calendar (src/systems/calendar.js on core/Clock: 5 s a day at 1×, the five daily
// bands, the speed unlocks), stepped here while the hub is on screen. It is saved in the slot's campaign save (core/
// Autosave: each new month, on Pause, leaving the hub, the app going to the background), the slot card's Year / Month
// with it; loading puts the clock back exactly (at a speed the rules still allow). ?debug=1: skip a day / month / year.
// Milestone 3: each open resort has its booking system (src/systems/bookings.js: offers, bookings, stays, room states),
// moved on at every band edge of its calendar (and through a debug skip, edge by edge), saved in the campaign save with
// the calendar (also after each Accept / Decline / room pick). ?debug=1: "Rooms Ready" puts Dirty rooms back to Ready.
// Milestone 4: each open resort has its opening team (src/systems/staff.js: the Founder + four Start staff) and its
// housekeeping (src/systems/housekeeping.js: cleaning jobs, queue, linen, late rooms), moved on in game minutes each step
// and at every band edge before it; both are saved in the campaign save.
// Milestone 5: each open resort has its reviews (src/systems/reviews.js: the seven stay categories, guest weighting, a
// review per stay, REP / Rank, the rolling headline scores and the monthly star rating), moved on by the booking edges and
// saved with the rest. The review card and the monthly Roadside Guide are core MajorFeedback moments (the calendar stands
// still while one shows; a tap first shows every part, the next closes it).
// Milestone 6: each open resort has its finance (src/systems/finance.js: Credits on a core EconomySystem ledger, room and
// café income, wages / upkeep / supplies, the Emergency Credit, pricing bands per room type), moved on by the booking
// edges after the reviews and saved with the rest.
// M6b: the chibi cast (data/cast.js). Dame Opal Fairweather's welcome card shows once for a new resort (the save's
// opal.welcomed, set and saved as it shows; never for a reload or an older save), and her line opens each month's
// Roadside Guide moment, whose inspectors now have their portraits.
// Milestone 7: each open resort has its complaints (src/systems/complaints.js: triggers, complaints, recovery actions and
// results), moved on with the bookings and the game minute and saved with the rest. The calendar also stands still while a
// complaint's sheet is open (the screen's holdsCalendar), so choosing an action never costs bands.
// Milestone 8: each open resort has its maintenance (src/systems/maintenance.js: Condition of every facility and room, wear,
// breakdowns, the Maintenance person's jobs, repair and parts costs), moved on in game minutes each step and with the
// bookings' band edges, and saved with the rest. ?debug=1&maint=0 stops wear (the older milestones' browser runs).
// Add ?debug=1 for the FPS/state overlay and the setup-data check, ?screen=test for the scaling / tap / asset-loader test
// screen. With ?debug=1, &complaints=0 switches complaint triggers off (the older milestones' browser runs), &safe=phone|tablet stands in a notch and home bar (safe-area insets) on any screen, and
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
import { Autosave } from '../../../core/Autosave.js';
import { createCalendar } from './systems/calendar.js';
import { createBookingSystem } from './systems/bookings.js';
import { createHousekeeping } from './systems/housekeeping.js';
import { loadTeam, saveTeam } from './systems/staff.js';
import { createReviews } from './systems/reviews.js';
import { createFinance } from './systems/finance.js';
import { createComplaints } from './systems/complaints.js';
import { createMaintenance } from './systems/maintenance.js';
import { MajorFeedback } from '../../../core/MajorFeedback.js';
import { skipMoment, opalWelcomeMoment } from './screens/reviewMoments.js';
import { validateCast } from '../data/cast.js';
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
// (Milestone 5) the review card and the monthly Roadside Guide: the calendar stands still while one shows.
const feedback = new MajorFeedback({ layout, width: W, height: renderer.height, minShowSec: 0.5 });
bus.on('renderer:resize', () => (feedback.height = renderer.height));
bus.on('screen:change', ({ to } = {}) => to !== 'resort' && clearMoments());
function clearMoments() {
  feedback.queue.length = 0;
  feedback.current = null;
}
// A tap: while the parts are still coming it shows them all (Skip); once they are all shown it closes the moment.
function tapMoment() {
  if (!skipMoment(feedback)) feedback.acknowledge();
}
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
    feedback.update(dt);
    if (open && router.currentName === 'resort' && !feedback.active && !resortScreen.holdsCalendar) {
      open.calendar.update(dt); // the calendar runs only while the hub is on screen
      open.housekeeping.advance(open.calendar.minute); // (M4) cleaning, in game minutes, up to now
      open.complaints.advance(open.calendar.minute); // (M7) a late party's 30 minutes at Reception
      open.maintenance.advance(open.calendar.minute); // (M8) maintenance jobs, in game minutes, up to now
    }
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
    feedback.render(ctx);
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
    return loop.paused || dialog.active || feedback.active;
  },
  onTap: (p) => (loop.paused ? loop.resume('tap') : dialog.active ? dialog.onTap(p) : tapMoment()),
  onDown: (p) => dialog.active && dialog.onDown?.(p),
  onUp: (p) => dialog.active && dialog.onUp?.(p),
  onBack: () => (loop.paused ? loop.resume('back') : dialog.active ? dialog.onBack() : tapMoment()),
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
let open = null; // { n, data, calendar, bookings, team, housekeeping, reviews, finance, complaints, maintenance } — the resort on screen
let account = {}; // the account store (core/CampaignSlots): empty until achievements / tokens / NG+ exist

// A campaign on screen: its save plus its calendar (Milestone 2) and its bookings (Milestone 3), put back exactly where
// the save left them.
function openRun(n, data) {
  const run = { n, data, calendar: null, bookings: null, team: null, housekeeping: null, reviews: null, finance: null, complaints: null, maintenance: null };
  // (Milestone 5) the speed unlocks read the live Rank
  run.calendar = createCalendar({ bus, saved: data.calendar ?? null, run: () => ({ ...run.data, reviews: run.reviews?.live ?? run.data.reviews }) });
  const c = run.calendar;
  run.bookings = createBookingSystem({ seed: data.seed, saved: data.bookings ?? null, bus, day: c.today, band: c.band.id });
  run.team = loadTeam(data.staff ?? null, data.seed, data.resort.founder.id); // (Milestone 4)
  run.housekeeping = createHousekeeping({ saved: data.housekeeping ?? null, team: run.team, bookings: run.bookings, bus });
  run.bookings.attach(run.housekeeping);
  run.reviews = createReviews({ saved: data.reviews ?? null, bus, team: run.team, seed: data.seed }); // (Milestone 5)
  run.bookings.attachReviews(run.reviews);
  run.finance = createFinance({ saved: data.finance ?? null, bus, team: run.team, day: c.today }); // (Milestone 6)
  run.bookings.attachFinance(run.finance);
  run.complaints = createComplaints({ saved: data.complaints ?? null, bus, team: run.team, seed: data.seed, bookings: run.bookings, finance: run.finance }); // (Milestone 7)
  run.bookings.attachComplaints(run.complaints);
  run.reviews.attachComplaints(run.complaints);
  if (debug.enabled && PARAMS.get('complaints') === '0') run.complaints.setEnabled(false); // (older milestones' browser runs)
  // (Milestone 8) Condition, wear, breakdowns, maintenance jobs
  run.maintenance = createMaintenance({ saved: data.maintenance ?? null, team: run.team, bookings: run.bookings, finance: run.finance, complaints: run.complaints, bus, seed: data.seed, rules: debug.enabled && PARAMS.get('maint') === '0' ? { noWear: true } : {} });
  run.bookings.attachMaintenance(run.maintenance);
  run.housekeeping.attachMaintenance(run.maintenance);
  run.reviews.attachMaintenance(run.maintenance);
  run.finance.attachMaintenance(run.maintenance);
  run.complaints.attachMaintenance(run.maintenance);
  open = run;
  run.bookings.sync(c.today, c.bandIndex); // (a save is always in step; this only catches up a damaged one)
  return run;
}
// (M6b) Dame Opal's welcome, once for a new resort: shown as the hub opens, marked and saved at once.
function welcomeIfDue(run) {
  if (run?.data.opal?.welcomed !== false) return;
  run.data.opal.welcomed = true;
  feedback.show(opalWelcomeMoment({ layout, assets }));
  autosave.request('welcome');
  debug.log('Opal: welcome card');
}
// Every band edge moves the open resort's bookings on (check-ins, check-outs, nights, offers), in order.
bus.on('band:change', () => open && open.bookings.sync(open.calendar.today, open.calendar.bandIndex));
// The campaign save: the calendar as it stands, the date the slot card shows, then the slot (save + summary record).
async function saveRun() {
  if (!open) return;
  const { n, data, calendar, bookings, team, housekeeping, reviews, finance, complaints, maintenance } = open;
  data.calendar = calendar.serialize();
  data.bookings = bookings.serialize();
  data.staff = saveTeam(team);
  data.housekeeping = housekeeping.serialize();
  data.reviews = reviews.serialize();
  data.stars = reviews.stars ?? 0;
  data.finance = finance.serialize();
  data.complaints = complaints.serialize();
  data.maintenance = maintenance.serialize();
  const c = calendar.clock;
  data.date = { year: c.year, month: c.month, day: c.day };
  await campaigns.save(n, data);
}
const autosave = new Autosave({
  bus,
  triggers: ['clock:month', 'booking:action', 'review:month', 'finance:band', 'complaint:result', 'mt:breakdown', 'mt:service'],
  save: () => saveRun(),
  stamp: () => (open ? JSON.stringify([open.calendar.serialize(), open.bookings.serialize(), open.housekeeping.serialize(), open.reviews.serialize(), open.finance.serialize(), open.complaints.serialize(), open.maintenance.serialize()]) : null),
  enabled: () => !!open,
});
autosave.installBackground(); // the app going to the background (or the page closing) saves at once
bus.on('clock:speed', ({ speed }) => speed === 0 && autosave.request('pause'));
bus.on('autosave:done', ({ reason }) => debug.log(`saved (${reason}): ${open?.calendar.dateText() ?? ''}`));
bus.on('autosave:failed', ({ error }) => debug.log(`save failed: ${error?.message ?? error}`));
bus.on('band:change', ({ band }) => debug.log(`band: ${band}`));
// ?debug=1: skip whole days (the speed unlocks follow the year); a new month on the way saves as usual.
function skipDays(days) {
  if (!open) return;
  open.calendar.skipDays(days);
  open.bookings.sync(open.calendar.today, open.calendar.bandIndex); // every band edge on the way, in order
  open.housekeeping.advance(open.calendar.minute);
  open.complaints.advance(open.calendar.minute);
  open.maintenance.advance(open.calendar.minute);
  debug.log(`skipped ${days} day(s): ${open.calendar.dateText()}`);
}

// ?debug=1: REP straight to the next Rank (so 4× at Rank C can be tested).
function addRep() {
  if (!open) return;
  open.reviews.addRep();
  debug.log(`REP ${open.reviews.repValue} · Rank ${open.reviews.rank.id}`);
  autosave.request('booking:action');
}

async function prepareSaves() {
  const adapter = await createStorageAdapter({ dbName: SAVE.dbName, prefix: SAVE.localPrefix });
  campaigns = createCampaigns({ adapter, save: SAVE, bus });
  if (debug.enabled && PARAMS.get('reset') === '1') for (const n of campaigns.slots.numbers()) await campaigns.slots.remove(n);
  await campaigns.refresh();
  account = await campaigns.slots.loadAccount();
  settings.attachStore(adapter, 'settings'); // the settings slot in the account database too
  if (debug.enabled) {
    const v = validateCast(validateSetup(new DataValidator(), { art: true }), { art: true }); // (M6b) + the cast
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
  openRun(n, data);
  debug.log(`slot ${n} opened: ${data.resort.name} · ${open.calendar.dateText()} · ${open.calendar.band.name}`);
  rememberResort(n);
  router.go('resort');
  welcomeIfDue(open); // (a new resort reloaded before its welcome was saved)
}

async function startResort(n, setup) {
  await campaigns.refresh();
  const old = campaigns.card(n);
  const write = async () => {
    const data = await campaigns.start(n, setup);
    openRun(n, data);
    debug.log(`new resort in slot ${n}: ${setup.resort}, founder ${setup.founder}`);
    rememberResort(n);
    router.go('resort');
    welcomeIfDue(open);
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
  if (open) {
    autosave.request('leave');
    await autosave.flush().catch(() => {}); // leaving the hub saves the calendar exactly where it is
  }
  rememberResort(null);
  router.go('menu');
  await campaigns.refresh();
  open = null;
}
const resortScreen = createResortScreen({ renderer, layout, assets, bus, sheet, feedback, run: () => open, onMenu: () => leaveResort(), debug, reducedFlashes: () => settings.get('reducedFlashes') === true, onSkip: (days) => skipDays(days), onRep: () => addRep() });

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
  window.__rw = { bus, renderer, layout, input, loop, router, assets, sheet, dialog, systemBack, textPrompt, settings, governor, haptics, splashScreen, menuScreen, slotsScreen, setupScreen, resortScreen, feedback, addRep, playSlot, startResort, deleteSlot, newGame, openSettings, booting, autosave, clearMoments, saveRun, skipDays, taps: [], get booted() { return booted; }, get account() { return account; }, get campaigns() { return campaigns; }, get open() { return open; } };
}

router.go('boot');
loop.start();
