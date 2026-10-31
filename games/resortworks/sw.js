// RESORTWORKS â€” service worker (offline cache for the installed web app).
//
// NETWORK FIRST: when the phone is online it always fetches the newest files
// (so a new build shows up on the next open) and keeps a copy; when offline
// it plays from that copy.
//
// VERSION is stamped automatically by publish.ps1 on every publish. A new
// version makes the phone install this worker fresh and throw away old copies.
//
// This game imports the shared series engine from ../../core/, which sits
// outside this folder. Requests from the game page still pass through this
// worker, so the engine files are cached too.
const VERSION = '20261031-220509';
const CACHE = 'resortworks-' + VERSION;

// The page itself + manifest + icons, so the app opens offline straight away.
const CORE = ['./', './index.html', './manifest.webmanifest', './styles/app.css',
  './assets/branding/pwa/icon-192.png', './assets/branding/pwa/icon-512.png'];
// Every code file (game + shared engine) â€” filled in by publish.ps1 so the whole
// game's code is saved on the very first visit. Art is cached the first time the
// game loads it. (Empty when run locally.)
const PRECACHE = ['./src/app/campaigns.js', './src/screens/MenuScreen.js', './src/screens/ResortScreen.js', './src/screens/resortSheets.js', './src/screens/reviewMoments.js', './src/screens/SetupScreen.js', './src/screens/SlotsScreen.js', './src/screens/TestScreen.js', './src/systems/bookings.js', './src/systems/calendar.js', './src/systems/complaints.js', './src/systems/finance.js', './src/systems/housekeeping.js', './src/systems/maintenance.js', './src/systems/progressHooks.js', './src/systems/resort.js', './src/systems/resortWorld.js', './src/systems/reviews.js', './src/systems/staff.js', './src/ui/resortArt.js', './src/main.js', './data/assets.js', './data/bookings.js', './data/calendar.js', './data/cast.js', './data/complaints.js', './data/finance.js', './data/housekeeping.js', './data/lot.js', './data/maintenance.js', './data/reviews.js', './data/save.js', './data/settings.js', './data/setup.js', './data/staff.js', './styles/app.css', '../../core/ui/Backdrop.js', '../../core/ui/BottomBar.js', '../../core/ui/BottomSheet.js', '../../core/ui/Button.js', '../../core/ui/CoachMark.js', '../../core/ui/ContextCard.js', '../../core/ui/CreditsRoll.js', '../../core/ui/HelpArchive.js', '../../core/ui/HintLine.js', '../../core/ui/ItemArt.js', '../../core/ui/Kit.js', '../../core/ui/MenuSheet.js', '../../core/ui/Modal.js', '../../core/ui/ScrollList.js', '../../core/ui/ScrollPanel.js', '../../core/ui/SettingsSheet.js', '../../core/ui/SetupArt.js', '../../core/ui/StaffCard.js', '../../core/ui/StationSheet.js', '../../core/ui/StudioSplash.js', '../../core/ui/TextPrompt.js', '../../core/ui/Toast.js', '../../core/ui/TopBar.js', '../../core/AccountBook.js', '../../core/AccountRecords.js', '../../core/AchievementSystem.js', '../../core/AdConsent.js', '../../core/AdMobProvider.js', '../../core/AdService.js', '../../core/Agent.js', '../../core/AlphaHit.js', '../../core/AppShell.js', '../../core/ArtRecolor.js', '../../core/AssetManager.js', '../../core/AssetValidator.js', '../../core/AssignmentSystem.js', '../../core/AudioManager.js', '../../core/Autosave.js', '../../core/BuildFlags.js', '../../core/CachedLayer.js', '../../core/Camera.js', '../../core/CampaignEnding.js', '../../core/CampaignSlots.js', '../../core/CanvasLoss.js', '../../core/CareerRecords.js', '../../core/CharacterMotion.js', '../../core/Clock.js', '../../core/CommerceService.js', '../../core/CompanyRank.js', '../../core/CompetitionPrereqs.js', '../../core/CompetitionSystem.js', '../../core/Completion.js', '../../core/ContractSystem.js', '../../core/DataValidator.js', '../../core/DebugOverlay.js', '../../core/DiscoveryArchive.js', '../../core/EconomySystem.js', '../../core/EntitlementService.js', '../../core/EventBus.js', '../../core/EventSystem.js', '../../core/FacilityLevels.js', '../../core/FacilitySystem.js', '../../core/FakeStoreProvider.js', '../../core/FixedStepLoop.js', '../../core/FloatFeed.js', '../../core/FounderPerks.js', '../../core/FrameGovernor.js', '../../core/GoogleConsent.js', '../../core/GradeEngine.js', '../../core/Grid.js', '../../core/GuideSystem.js', '../../core/Haptics.js', '../../core/HintSystem.js', '../../core/Input.js', '../../core/IsoProjection.js', '../../core/IsoRoom.js', '../../core/ItemSystem.js', '../../core/JobHistory.js', '../../core/MajorFeedback.js', '../../core/MarketSystem.js', '../../core/NamePicker.js', '../../core/NativeBridge.js', '../../core/NgPlusSystem.js', '../../core/NotificationSystem.js', '../../core/Pathing.js', '../../core/PinchZoom.js', '../../core/PlayBillingProvider.js', '../../core/ProductSystem.js', '../../core/ProjectSystem.js', '../../core/Rankings.js', '../../core/RecruitmentSystem.js', '../../core/Renderer.js', '../../core/ReputationSystem.js', '../../core/ResearchSystem.js', '../../core/ReviewText.js', '../../core/RivalSystem.js', '../../core/Rng.js', '../../core/RunArchive.js', '../../core/SaveManager.js', '../../core/SaveSlots.js', '../../core/SaveStore.js', '../../core/ScreenRouter.js', '../../core/SecretEngine.js', '../../core/Selection.js', '../../core/SeriesSettings.js', '../../core/Settings.js', '../../core/SoundSynth.js', '../../core/SponsorSystem.js', '../../core/SpriteCache.js', '../../core/StaffModel.js', '../../core/StaffSystem.js', '../../core/StorageAdapter.js', '../../core/StoreStub.js', '../../core/SynergyEvaluator.js', '../../core/SystemBack.js', '../../core/TextFit.js', '../../core/Theme.js', '../../core/TrainingSystem.js', '../../core/TrophyCase.js', '../../core/UiLayout.js', '../../core/UnlockActions.js', '../../core/VfxSystem.js', '../../core/WorldGestures.js'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // One file failing must not block the rest.
      .then((c) => Promise.allSettled(CORE.concat(PRECACHE).map((u) =>
        c.add(new Request(u, { cache: 'reload' })))))
      .catch(() => { /* offline during install: runtime caching will fill in */ })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('resortworks-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(req, { cache: 'no-cache' })
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true })
        .then((hit) => hit || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error())))
  );
});
