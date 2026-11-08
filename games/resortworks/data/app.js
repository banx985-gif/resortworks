// RESORTWORKS as a phone app (BIG_RUN_5 Job 3, like BOTWORKS M29a): the words and switches of the Android app
// (src/app/NativeApp.js), the same pattern as RACEWORKS's data/app.js. The app's id and name live with the Android
// project (apps/resortworks-android/app.json), not here.

// The version players see (Settings → Privacy & legal). The build number comes from Android in the app.
export const APP_VERSION = { name: '1.0.0' };

// The first-launch ads & privacy answer, this device only (core/AdConsent).
export const AD_CONSENT_KEY = 'resortworks:adConsent';

// ======================================================================================================================
//  AD IDS — THE ONE PLACE THEY LIVE (the app code and tools/android-project.mjs both read this block).
//  ⚠ TEST IDS: these are Google's official AdMob TEST ids. They show "Test Ad" and never earn money.
//  Before the public release: make the RESORTWORKS app and its two ad units in AdMob, paste the real ids below, set
//  test: false, then rebuild (tools/build-android.ps1 -Game resortworks -Release). Nothing else needs changing.
// ======================================================================================================================
export const AD_IDS = {
  test: true, // ⚠ true = Google test ads (no money). Set false only together with the real ids below.
  appId: 'ca-app-pub-3940256099942544~3347511713', // ⚠ TEST — AdMob app id (goes into the Android manifest)
  interstitial: 'ca-app-pub-3940256099942544/1033173712', // ⚠ TEST — the "break-time" ad
  rewarded: 'ca-app-pub-3940256099942544/5224354917', // ⚠ TEST — the "watch for a reward" ad
};

// Google's consent form (EU / UK players, core/GoogleConsent) — ⚠ TEST SETTINGS, on only while AD_IDS.test is true:
// the app pretends to be in Europe so the form can be seen (on an emulator, or a phone listed in devices). With the
// real ids (test: false) the phone's real place decides and this block is ignored.
export const CONSENT_TEST = {
  on: AD_IDS.test, // ⚠ TEST — follows AD_IDS.test; never on in a real release
  geography: 'EEA',
  devices: [],
};

// The privacy policy page (games/resortworks/privacy.html, published with the game).
export const PRIVACY_URL = 'https://banx985-gif.github.io/resortworks/privacy.html';

export const APP_TEXT = {
  quitTitle: 'Quit RESORTWORKS?',
  quitBody: 'Your resort is saved. You can carry on where you left off next time.',
  quitYes: 'Quit',
  quitNo: 'Stay',
  consentTitle: 'Ads and your privacy',
  consentBody: `RESORTWORKS is free and shows a few ads: ones you choose to watch for a reward, and an occasional break-time ad at the end of a month (never before your first award). The ads come from Google, which may use your phone's advertising ID to pick them.${AD_IDS.test ? ' This version shows Google test ads only.' : ''} You can change this any time in Settings → Privacy & legal.`,
  consentPersonal: 'OK — ads may be picked for me',
  consentNonPersonal: 'OK — general ads only',
  // Settings → Privacy & legal in the app: a short summary, the ad choice and the full privacy page.
  privacyBody: `RESORTWORKS keeps your resorts on this phone only and has no account. Ads come from Google AdMob${AD_IDS.test ? ' (test ads in this version)' : ''}, which may use your phone's advertising ID. Purchases go through Google Play.`,
  privacyAds: 'Ad choices',
  privacyAdsNow: (personalised, source = 'game') => (source === 'google' ? "Now: your answers in Google's consent form" : personalised ? 'Now: ads may be picked for me' : 'Now: general ads only'),
  privacyPage: 'Privacy policy',
};
