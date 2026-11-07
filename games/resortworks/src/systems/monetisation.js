// RESORTWORKS monetisation (Milestone 29, bible §32, series rule 9): core/CommerceService (purchases, each counted once
// by its store transaction id), core/EntitlementService (Remove Ads, the processed ids) and core/AdService (rewarded and
// break-time ads with their caps), set up from data/monetisation.js. One for the whole app; the open resort is read
// through run() each time. Nothing in the simulation ever reads this file: switched off (SERVICES.enabled false or
// ?services=0) there is no store and no ad, and the game is the same game (tests/resortworks/m29.test.mjs).
//   createMonetisation({ bus, now, account, run, provider, adProvider, enabled }) → m
//     m.enabled · m.tokens · m.removeAds · m.adsAllowed() (never before the account's first award)
//     m.tokenBlock(sink) → why not | null (anything not on the whitelist is refused) · m.spend(sink, arg) → { ok, why?, say? }
//     m.placement(id) → { show, why, label } · await m.watch(id) → { ok, message }
//     await m.buy(key) · await m.restore() · await m.loadProducts() · m.price(key)
//     await m.breakPoint('monthClose', { decisionPending }) → { shown }
//     m.save() (into the account store: account.money) · m.store (core CommerceService) · m.ads (core AdService)
import { EntitlementService } from '../../../../core/EntitlementService.js';
import { AdService, NO_AD_PROVIDER } from '../../../../core/AdService.js';
import { CommerceService, NO_STORE_PROVIDER } from '../../../../core/CommerceService.js';
import { Rng } from '../../../../core/Rng.js';
import { SERVICES, PRODUCTS, TOKEN_SINKS, NEVER_FOR_TOKENS, NEVER_WORDS, REWARDED, INTERSTITIAL_CAPS, STORE_MESSAGES } from '../../data/monetisation.js';
import { PALETTES } from '../../data/setup.js';
import { PARTNERS } from '../../data/partners.js';

const blank = () => ({ tokens: 0, ent: null, ads: null, firstAward: false, repaints: 0, spent: {} });

export function createMonetisation({ bus = null, now = () => Date.now(), account = {}, run = () => null, provider = null, adProvider = null, enabled = SERVICES.enabled } = {}) {
  const acc = () => {
    const m = (account.money ??= blank());
    for (const [k, v] of Object.entries(blank())) m[k] ??= v; // (an older or partial record: filled in)
    return m;
  };
  const ent = new EntitlementService({ now, bus });
  ent.load?.(acc().ent ?? null);
  ent.loadProcessed?.(acc().processed ?? []);
  const save = () => {
    acc().ent = ent.serialize();
    acc().processed = ent.serializeProcessed(); // (every purchase's transaction id: never granted twice)
    acc().ads = ads.serializeAccount();
  };
  const store = new CommerceService({
    provider: enabled ? provider ?? NO_STORE_PROVIDER : NO_STORE_PROVIDER,
    products: PRODUCTS,
    entitlements: ent,
    messages: STORE_MESSAGES,
    now,
    bus,
    grant: (product) => {
      if (product.tokens) acc().tokens += product.tokens;
    },
    commit: async () => {
      save();
      bus?.emit('money:change', {});
    },
  });
  const ads = new AdService({ provider: enabled ? adProvider ?? NO_AD_PROVIDER : NO_AD_PROVIDER, caps: INTERSTITIAL_CAPS, placements: REWARDED, now, adFree: () => ent.removeAds, bus });
  ads.loadAccount(acc().ads ?? null);
  // the account's first award (any run, any slot): ads may show from then on
  bus?.on('awards:result', ({ result }) => {
    if (result?.won && !acc().firstAward) {
      acc().firstAward = true;
      save();
    }
  });
  const weekScope = () => Math.floor((run()?.bookings?.at?.day ?? 0) / 7);
  const adsAllowed = () => enabled && !!acc().firstAward;

  function tokenBlock(sink) {
    if (NEVER_FOR_TOKENS.includes(sink) || !TOKEN_SINKS[sink]) return NEVER_WORDS;
    return null;
  }
  // The refresh itself (shared by tokens and the rewarded ad). → { ok, why?, say? }
  function apply(sink, arg) {
    const o = run();
    if (!o) return { ok: false, why: 'Open a resort first.' };
    const salt = new Rng(`${o.data?.seed ?? 'r'}:refresh:${o.bookings.at.day}:${(acc().spent[sink] ?? 0) + 1}`).int(1, 1e6);
    if (sink === 'applicants') {
      o.staffing.newApplicants(o.bookings.at.day, salt);
      return { ok: true, say: 'New applicants are at the Motel Service Block.' };
    }
    if (sink === 'offers') {
      const n = o.bookings.moreOffers(salt);
      return n ? { ok: true, say: `${n} more booking offer${n === 1 ? '' : 's'} at Reception.` } : { ok: false, why: 'No guest would book right now.' };
    }
    if (sink === 'partner') {
      const p = PARTNERS.find((x) => !o.partners.whyNotOffer(x.id));
      if (!p) return { ok: false, why: 'No partner can make an offer right now.' };
      o.partners.offerNow(p.id);
      return { ok: true, say: `${p.name} sent an offer.` };
    }
    if (sink === 'repaint') {
      const id = arg && PALETTES.some((x) => x.id === arg) ? arg : null;
      if (!id || id === o.data.resort.palette) return { ok: false, why: 'Pick a different colour scheme.' };
      o.data.resort.palette = id;
      return { ok: true, say: 'Repainted.' };
    }
    return { ok: false, why: NEVER_WORDS };
  }
  function spend(sink, arg = null) {
    const why = tokenBlock(sink);
    if (why) return { ok: false, why };
    const cost = TOKEN_SINKS[sink].cost;
    if (acc().tokens < cost) return { ok: false, why: `It costs ${cost} Resort Tokens (you have ${acc().tokens}).` };
    const r = apply(sink, arg);
    if (!r.ok) return r;
    acc().tokens -= cost;
    acc().spent[sink] = (acc().spent[sink] ?? 0) + 1;
    save();
    bus?.emit('money:change', {});
    return r;
  }
  function placement(id) {
    const p = REWARDED.find((x) => x.id === id);
    if (!p) return { show: false, why: 'unknown' };
    if (!adsAllowed()) return { show: false, why: enabled ? 'After your first award.' : 'off' };
    const why = ads.rewardBlock(id, p.limit.per === 'realHours' ? null : weekScope());
    return { show: true, why, label: p.label };
  }
  async function watch(id) {
    const p = REWARDED.find((x) => x.id === id);
    if (!p || !adsAllowed()) return { ok: false, message: 'Not available.' };
    const r = await ads.rewarded(id, p.limit.per === 'realHours' ? null : weekScope(), () => {
      if (p.reward.tokens) {
        acc().tokens += p.reward.tokens;
        return { tokens: p.reward.tokens };
      }
      const a = apply(p.reward.sink);
      return a.ok ? a : false;
    });
    save();
    if (r.ok) bus?.emit('money:change', {});
    return { ok: r.ok, message: r.ok ? (r.reward?.tokens ? `+${r.reward.tokens} Resort Tokens.` : r.reward?.say) : r.reason === 'cancelled' ? 'Closed early: no reward.' : 'No ad right now.' };
  }
  async function breakPoint(bp, ctx = {}) {
    if (!adsAllowed() || ent.removeAds) return { shown: false };
    const r = await ads.interstitial(bp, ctx);
    save();
    return r;
  }
  return {
    get enabled() {
      return enabled;
    },
    get tokens() {
      return acc().tokens;
    },
    get removeAds() {
      return ent.removeAds;
    },
    adsAllowed,
    tokenBlock,
    spend,
    placement,
    watch,
    breakPoint,
    buy: async (key) => (enabled ? store.buy(key) : { ok: false, status: 'unavailable', message: STORE_MESSAGES.unavailable }),
    restore: async () => (enabled ? store.restore() : { ok: false, status: 'unavailable', message: STORE_MESSAGES.unavailable }),
    loadProducts: async () => (enabled ? store.loadProducts() : { ok: false, products: [], message: STORE_MESSAGES.unavailable }),
    price: (key) => store.price(key),
    save,
    store,
    ads,
    entitlements: ent,
  };
}
