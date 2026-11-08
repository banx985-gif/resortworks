// RESORTWORKS as an Android app (BIG_RUN_5 Job 3, like BOTWORKS M29a): the shared app pieces (core/NativeBridge,
// AppShell, AdMobProvider, PlayBillingProvider, AdConsent, GoogleConsent) set up for this game — RACEWORKS's pattern
// (games/raceworks/src/app/NativeApp.js). In a web browser none of this runs: the web build keeps core/SystemBack, the
// page's visibility events and, with ?debug=1, the pretend store.
//
// The ad ids are data/app.js AD_IDS (Google's official TEST ids until the real ones are pasted there). The store says
// "unavailable" until the app is on Google Play. Every ad cap, reward and grant-once rule stays in
// src/systems/monetisation.js (core/AdService, CommerceService, EntitlementService) — the providers only show / sell.
//
// Consent: on every launch Google's consent service is asked first. Where Google's rules apply (EU, UK…) Google's own
// form is the only question and ads start only if Google says they may; everywhere else the game's own ads & privacy
// question shows once. No answer = no ads (AdMobProvider is started only after one).
import { AppShell } from '../../../../core/AppShell.js';
import { AdMobProvider } from '../../../../core/AdMobProvider.js';
import { PlayBillingProvider } from '../../../../core/PlayBillingProvider.js';
import { GoogleConsent } from '../../../../core/GoogleConsent.js';
import { PRODUCTS } from '../../data/monetisation.js';
import { APP_TEXT, AD_IDS, CONSENT_TEST } from '../../data/app.js';

// The two providers for src/systems/monetisation.js (made before it, in the app only): ads from AdMob, purchases from
// Google Play. → null on the web.
export function nativeProviders({ bridge, consent }) {
  if (!bridge?.isNative) return null;
  return {
    ads: new AdMobProvider({ bridge, consent: () => consent.value, ids: AD_IDS, testing: AD_IDS.test }),
    store: new PlayBillingProvider({ bridge, products: PRODUCTS }),
  };
}

//   setupNativeApp({ bridge, providers, money, consent, dialog, art, accent, onBack, onBackground, onResume, isRunning, onQuit })
//     onBack()   → true if the game used the Back press (main.js back(): the dialog, sheets, screens); false at the Main
//                Menu, where the app asks "Quit RESORTWORKS?"   onQuit() → a promise (the last save) first
//     onBackground / onResume — the calendar pauses and the save is written / the game carries on
//   → null on the web; in the app { consent, google, ads, store, shell, askConsent(force) }
export function setupNativeApp({ bridge, providers, money = null, consent, dialog, art = null, accent, onBack, onBackground = () => {}, onResume = () => {}, isRunning = () => false, onQuit = async () => {} }) {
  if (!bridge?.isNative || !providers) return null;
  const { ads, store } = providers;
  let asked = false;
  let busy = null;
  // ⚠ TEST builds pretend to be in Europe (data/app.js CONSENT_TEST) so Google's form can be checked; never once the
  // real ad ids are in (AD_IDS.test false).
  const google = new GoogleConsent({ bridge, test: CONSENT_TEST.on && AD_IDS.test ? CONSENT_TEST : null });

  const shell = new AppShell({
    bridge,
    onBack: () => {
      if (money?.ads?.showing) return true; // the ✕ of a showing ad is the ad's own
      return onBack();
    },
    confirmQuit: (quit) => {
      if (dialog.active) return;
      dialog.confirm({ title: APP_TEXT.quitTitle, body: APP_TEXT.quitBody, art, yes: APP_TEXT.quitYes, no: APP_TEXT.quitNo, onYes: () => onQuit().finally(quit) });
    },
    onBackground,
    onResume: () => {
      onResume();
      if (asked && !google.last) askConsent(); // Google did not answer earlier (offline): ask again now
    },
    isRunning,
  });

  const fromGoogle = (info) => consent.set({ source: 'google', given: !!info?.canRequestAds, personalised: true });
  const startAds = () => consent.value.given && ads.init();

  function ownQuestion() {
    return new Promise((done) => {
      const pick = (personalised) => () => (consent.set({ personalised }), startAds(), done());
      dialog.show({
        title: APP_TEXT.consentTitle,
        body: APP_TEXT.consentBody,
        art,
        dismissible: false,
        buttons: [
          { id: 'yes', label: APP_TEXT.consentPersonal, accent, onTap: pick(true) },
          { id: 'npa', label: APP_TEXT.consentNonPersonal, accent, onTap: pick(false) },
        ],
      });
    });
  }
  async function ask(force) {
    asked = true;
    const info = await google.check();
    if (!info) {
      if (consent.answered) startAds();
      return;
    }
    if (google.applies(info)) {
      let now = info;
      if (force && info.status === 'OBTAINED') now = (await google.showPrivacyOptions()) ?? info;
      else if (info.status === 'REQUIRED') now = (await google.showForm()) ?? info;
      if (now.status !== 'REQUIRED') fromGoogle(now);
      if (consent.value.source === 'google') startAds();
      return;
    }
    if (consent.value.source === 'google') consent.set({ source: 'google', given: false });
    if (!consent.answered || !consent.value.given || force) return ownQuestion();
    startAds();
  }
  function askConsent(force = false) {
    if (!busy) busy = ask(force).finally(() => (busy = null));
    return busy;
  }
  return { consent, google, ads, store, shell, askConsent };
}
