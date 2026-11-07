// Repeat guests / Guestbook (Milestone 20, bible §19; Kairosoft rule 3 Hall of Fame and Cowork's "Regulars"). Plain data —
// src/systems/guestbook.js runs it. The bible gives the memories' names; every number here is Claude Code's pick (DECISIONS
// M20) unless marked Cowork's.
//
// Who is kept: every guest who left a review of 4★ or more, or made a memory (a bad one too), up to KEEP.max entries (each stay kept compact: its review's words only for a 5★ stay, for the Hall of Fame) (the
// least notable one-off guests go first). One-off average stays aren't kept — they never come back.
export const KEEP = { minStars: 4, max: 200 }; // (200 keeps a three-year save small: M11 hardening)
// The chance a guest comes back after a stay (its satisfaction), + a positive / redemption memory's share, × (1 + R16
// Repeat Guest CRM +20% + the team's repeat-guest traits). A disaster stay never comes back. They come back after
// delay days (seeded): from a month to two game years — "years later" (bible §19).
export const RETURN = { bySat: [{ min: 90, p: 0.3 }, { min: 78, p: 0.15 }], memory: 0.1, redemption: 0.15, delay: [28, 700] };
// Regulars (Cowork's pick): a guest with 2 or more stays before. +5 satisfaction (on arrival: added to their stay's final
// satisfaction) and they book earlier (their offer arrives 4–10 days ahead instead of 0–3). A returning guest takes one
// of that Morning's offer places, so returns change who books, not how many.
export const REGULAR = { stays: 2, sat: 5, ahead: [4, 10] };
// Memories (bible §19). kind: positive / redemption / negative. Each is checked at check-out; chance (when < 1) is
// seeded per stay. Positive and redemption memories feed Prestige (kept as points until Prestige is live, M23).
export const MEMORIES = [
  { id: 'honeymoon', name: 'Perfect Honeymoon', kind: 'positive', when: 'a Honeymoon Couple’s stay at 90+' },
  { id: 'pool', name: 'Kids Loved the Pool', kind: 'positive', chance: 0.6, when: 'a family stay with a pool and Activities 80+' },
  { id: 'meal', name: 'Best Meal', kind: 'positive', chance: 0.5, when: 'Food 88+ (R12 Signature Cuisine +10%)' },
  { id: 'saved', name: 'Saved by Great Service', kind: 'redemption', when: 'a complaint put right (M7)' },
  { id: 'disaster', name: 'Disaster Weekend', kind: 'negative', when: 'a 1★ or 2★ stay' },
  { id: 'celebrity', name: 'Celebrity Visit', kind: 'positive', when: 'a celebrity guest stays' },
  { id: 'event', name: 'A Great Event', kind: 'positive', when: 'their event was a Great Success (M19)' },
];
export const memoryById = (id) => MEMORIES.find((m) => m.id === id) ?? null;
export const PRESTIGE_PTS = { positive: 1, redemption: 2, negative: 0 };
// A regular's gift (bible §27D2 "guest gifts"): a Staff Item, 25% of the time when a Regular leaves 4★ or more.
export const GIFT = { chance: 0.25, minStars: 4 };
// The Hall of Fame (Kairosoft rule 3): the top HOF.n of the best stays, the best reviews and the most returns.
export const HOF = { n: 5 };
// Names for the guestbook (seeded per guest): one person "First Last"; a couple, family or group "The Lasts".
export const FIRST = ['Sam', 'Alex', 'Jo', 'Robin', 'Kit', 'Lee', 'Max', 'Ari', 'Nia', 'Theo', 'Ivy', 'Omar', 'Zoe', 'Ravi', 'Lena', 'Hugo', 'Mina', 'Eli', 'Rosa', 'Finn'];
export const LAST = ['Moreno', 'Okafor', 'Lindqvist', 'Patel', 'Nakamura', 'Brennan', 'Haddad', 'Silva', 'Novak', 'Kowalski', 'Achebe', 'Duarte', 'Fischer', 'Ito', 'Mensah', 'Quinn', 'Reyes', 'Sato', 'Varga', 'Walsh', 'Yilmaz', 'Abbott', 'Clarke', 'Dubois'];
