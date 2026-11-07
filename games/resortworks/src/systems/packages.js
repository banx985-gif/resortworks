// Packages (Milestone 18, bible §15 / §27I): the player puts packages on sale (the Packages sheet); an offer from a guest
// type a package is for picks it (a seeded roll each offer, src/systems/bookings.js makeOffers), books the package's
// nights and pays the room's nightly rate × the package's multiplier every night. Its inclusions take real places: they
// are reserved for every day of the stay when the booking is accepted, out of each facility's places a day (users a part
// of the day × level, the Tour Desk's tour places, an event venue's capacity), so a package can't be sold when they are
// full. A facility sold before arrival flags the booking at-risk; an inclusion that can't be given on the day (its
// facility gone or offline) is a package-failure trigger (M7's complaint) and that day's place is lost. While a package is
// on sale its guest types' demand rises (bible §27I, held within ±20% with every source: src/systems/guests.js).
// One resort is open at a time: the live state is kept at module level too (reservedOn / placesFor), like the site.
//   createPackages({ saved, bus, team, maintenance, complaints, seed }) → pk
//     pk.whyOff(id) (null = can be on sale) · pk.setOn(id, on) · pk.isOn(id) · pk.onSale() · pk.pick(offer, rng) ·
//     pk.plan(pkgId, x, room) → reservations or null · pk.reserve(booking, plan) · pk.roomOk(x, room) · pk.onEdge(day,
//     band, bookings) · pk.placesFor(fac, day) · pk.reservedOn(day, fac) · pk.stats · serialize()
//   On the bus: 'packages:change' · 'packages:sold' { booking, id } · 'packages:failed' { booking, inclusion, fac }
import { PACKAGES, packageById, PICK, VENUE_CAP, TOUR_PLACES } from '../../data/packages.js';
import { GUEST_TYPES, ROOM_TYPES } from '../../data/bookings.js';
import { FACILITIES, ROOMS, roomById } from '../../data/lot.js';
import { FACILITY_FX } from '../../data/facilities.js';
import { EVENING_IDS } from '../../data/research.js';
import { BANDS } from '../../data/calendar.js';
import { mult, has } from './facilities.js';
import { rx } from './research.js';
import { teamBonus } from './staff.js';
import { setDemandSource } from './guests.js';
import { minuteOf } from './calendar.js';

const clone = (x) => JSON.parse(JSON.stringify(x));
const BAND = Object.fromEntries(BANDS.map((b, i) => [b.id, i]));
export const freshPackages = () => ({ on: {}, res: {}, stats: { sold: {}, delivered: 0, failed: 0, atRisk: 0, upliftRevenue: 0 } });
const LIVE = { s: null, team: null };

// A facility's places a day for package guests (0: it gives none).
export function placesFor(fac, team = LIVE.team) {
  if (!has(fac)) return 0;
  if (VENUE_CAP[fac]) return VENUE_CAP[fac];
  if (TOUR_PLACES[fac]) return Math.floor(TOUR_PLACES[fac] * mult(fac) * (1 + rx('tours') + teamBonus(team, 'excursion')));
  const fx = FACILITY_FX[fac];
  if (!fx?.users) return 0;
  const food = (fx.cats ?? []).some((c) => c.cat === 'food');
  const fam = (fx.cats ?? []).some((c) => c.who === 'family');
  const k = 1 + (food ? rx('foodThroughput') + teamBonus(team, 'diningCapacity') : 0) + (EVENING_IDS.includes(fac) ? rx('eveningThroughput') + teamBonus(team, 'evening') : 0) + (fam ? teamBonus(team, 'familyActivity') : 0);
  return Math.floor(fx.users * mult(fac) * k);
}
export const reservedOn = (day, fac, st = LIVE.s) => st?.res?.[day]?.[fac] ?? 0;
// The facility ids a booking's package was given (its reviews count those places in full).
export const reservedFacs = (b) => [...new Set((b?.pkgRes ?? []).map((r) => r.fac))];

export function createPackages({ saved = null, bus = null, team = null, maintenance = null, complaints = null } = {}) {
  const s = load(saved);
  LIVE.s = s;
  LIVE.team = team;
  let mt = maintenance;
  let cp = complaints;
  const changed = () => bus?.emit('packages:change', {});
  // (each resort's own state and team: two resorts in one test process never share places)
  const freeOn = (day, fac, extra = {}) => placesFor(fac, team) - reservedOn(day, fac, s) - (extra[`${day}:${fac}`] ?? 0);

  // Why it can't be on sale now (one plain line), or null.
  function whyOff(id) {
    const p = packageById(id);
    if (!p) return 'No such package.';
    for (const inc of p.incl) {
      if (inc.facs && !inc.facs.some(has)) return `Needs ${inc.name}: build ${inc.facs.map((f) => FACILITY_NAMES[f] ?? f).join(' or ')}.`;
      if (inc.distinct && inc.facs.filter(has).length < inc.distinct) return `Needs ${inc.distinct} of: ${inc.facs.map((f) => FACILITY_NAMES[f] ?? f).join(', ')}.`;
      if (inc.needs?.roomRank && !ROOMS.some((r) => ROOM_TYPES[r.typeId].rank >= inc.needs.roomRank)) return `Needs a ${Object.values(ROOM_TYPES).find((t) => t.rank === inc.needs.roomRank).name} or better for the ${inc.name.toLowerCase()}.`;
    }
    return null;
  }
  const isOn = (id) => !!s.on[id] && !whyOff(id);
  const onSale = () => PACKAGES.filter((p) => isOn(p.id)).map((p) => p.id);
  const fitsAudience = (p, typeId) => p.audience.some((tag) => GUEST_TYPES[typeId]?.tags?.includes(tag));
  // The room must suit every inclusion (the romance amenity: Premium Room or better).
  function roomOk(x, room) {
    const p = packageById(x?.pkg);
    if (!p || !room) return true;
    return p.incl.every((inc) => !inc.needs?.roomRank || ROOM_TYPES[room.typeId ?? roomById(room)?.typeId]?.rank >= inc.needs.roomRank);
  }
  // The places a stay of this package would take: [{ day, fac, n }] — or null when one inclusion has no places left.
  function plan(pkgId, x) {
    const p = packageById(pkgId);
    if (!p || whyOff(pkgId)) return null;
    const out = [];
    const taken = {};
    const take = (day, fac, n) => {
      out.push({ day, fac, n, inc: null });
      taken[`${day}:${fac}`] = (taken[`${day}:${fac}`] ?? 0) + n;
    };
    const nights = x.nights ?? 1;
    for (const inc of p.incl) {
      if (!inc.facs) continue;
      const need = x.party ?? 1;
      const days = inc.per === 'day' ? Array.from({ length: nights }, (_, i) => x.arrival + i) : Array.from({ length: Math.min(nights, inc.uses) }, (_, i) => x.arrival + i);
      const perDay = inc.per === 'day' ? inc.uses : Math.ceil(inc.uses / days.length);
      const used = new Set();
      for (const day of days) {
        // the first of its facilities with places free (distinct: a different one each time)
        const fac = inc.facs.find((f) => has(f) && !(inc.distinct && used.has(f)) && freeOn(day, f, taken) >= need * perDay);
        if (!fac) return null;
        used.add(fac);
        take(day, fac, need * perDay);
        out[out.length - 1].inc = inc.id;
      }
      if (inc.distinct && used.size < Math.min(inc.distinct, days.length)) return null;
    }
    return out;
  }
  function reserve(b, pl) {
    b.pkgRes = pl.map((r) => ({ ...r }));
    for (const r of pl) {
      const d = (s.res[r.day] ??= {});
      d[r.fac] = (d[r.fac] ?? 0) + r.n;
    }
    s.stats.sold[b.pkg] = (s.stats.sold[b.pkg] ?? 0) + 1;
    bus?.emit('packages:sold', { booking: b.id, id: b.pkg });
  }
  // An offer from one of a package's guest types picks it (seeded: rng is the offer's own), when its places are free.
  function pick(o, rng) {
    const fits = PACKAGES.filter((p) => isOn(p.id) && fitsAudience(p, o.type)).sort((a, b) => b.mult - a.mult);
    const roll = rng.next(); // always drawn, so a package switched on or off never shifts another offer
    if (!fits.length) return null;
    const chance = PICK.base * (1 + rx('packageDemand') + teamBonus(team, 'upsell'));
    if (roll >= chance) return null;
    for (const p of fits) {
      const nights = Math.max(p.nights[0], Math.min(p.nights[1], o.nights));
      if (plan(p.id, { ...o, nights })) return { id: p.id, nights };
    }
    return null;
  }
  // A band edge: old days forgotten (Night); at Morning every upcoming package booking is checked (a facility gone: at
  // risk); at Midday each package guest staying is given today's inclusions — one that can't be (its facility gone or
  // offline) is a package failure.
  function onEdge(day, band, bk) {
    if (band === BAND.night) for (const k of Object.keys(s.res)) if (Number(k) < day - 1) delete s.res[k];
    if (band === BAND.morning)
      for (const b of bk?.upcoming ?? []) {
        if (!b.pkg) continue;
        const risk = (b.pkgRes ?? []).some((r) => !has(r.fac));
        if (risk && !b.pkgRisk) s.stats.atRisk++;
        b.pkgRisk = risk;
      }
    if (band === BAND.midday)
      for (const b of bk?.staying ?? []) {
        if (!b.pkg) continue;
        for (const r of b.pkgRes ?? []) {
          if (r.day !== day || r.given != null) continue;
          r.given = has(r.fac) && !(mt?.isOffline?.(r.fac) ?? false);
          if (r.given) s.stats.delivered++;
          else {
            s.stats.failed++;
            b.pkgFailed = (b.pkgFailed ?? 0) + 1;
            cp?.onPackageFail?.(b, minuteOf(day, band), r.fac);
            bus?.emit('packages:failed', { booking: b.id, inclusion: r.inc, fac: r.fac });
          }
        }
      }
  }

  setDemandSource('Packages', (typeId) => {
    if (!typeId) return null;
    const v = PACKAGES.filter((p) => isOn(p.id) && fitsAudience(p, typeId)).reduce((t, p) => t + p.demand, 0);
    return v ? { type: v, words: 'Packages on sale' } : null;
  });

  return {
    whyOff,
    isOn,
    onSale,
    setOn(id, on) {
      if (!packageById(id) || (on && whyOff(id))) return false;
      s.on[id] = !!on;
      changed();
      return true;
    },
    pick,
    plan,
    reserve,
    roomOk,
    onEdge,
    placesFor: (fac) => placesFor(fac, team),
    reservedOn: (day, fac) => reservedOn(day, fac, s),
    attachMaintenance(m) {
      mt = m;
    },
    attachComplaints(c) {
      cp = c;
    },
    addUplift(n) {
      s.stats.upliftRevenue += n;
    },
    get stats() {
      return clone(s.stats);
    },
    serialize: () => clone(s),
  };
}
const FACILITY_NAMES = { F06: 'a Snack Café', F09: 'a Restaurant', F10: 'a Kids Club', F11: 'a Family Pool', F13: 'Mini Golf', F14: 'a Tour Desk', F16: 'a Gym', F17: 'a Spa', F19: 'an Event Hall', F20: 'a Wedding Lawn', F22: 'a BBQ Terrace', F25: 'a Premium Restaurant', F27: 'Private Cabanas', F28: 'an Infinity Pool', F29: 'a VIP Lounge', F30: 'a Luxury Spa', F32: 'a Grand Ballroom', F34: 'a Paradise Pavilion', F35: 'a Sky Retreat' };

function load(saved) {
  const f = freshPackages();
  if (!saved || typeof saved !== 'object') return f;
  const s = clone(saved);
  return { on: Object.fromEntries(Object.entries(s.on ?? {}).filter(([id]) => packageById(id))), res: s.res && typeof s.res === 'object' ? s.res : {}, stats: { ...f.stats, ...(s.stats ?? {}), sold: { ...(s.stats?.sold ?? {}) } } };
}
