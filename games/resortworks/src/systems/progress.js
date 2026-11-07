// The campaign stage (Milestone 12, bible §4 / §27A): Roadside Motel → Holiday Lodge → … Each stage opens on its exact
// gate (Rank, star rating, completed stays; awards / Prestige / secrets when those systems arrive) and stays open for good.
// The stage sets what Build Mode lists, the room and staff caps and (Milestone 13) who applies for jobs.
//   freshProgress() → { stage: 'roadside', reached: { roadside: 0 } } (the save's `progress`)
//   createProgress({ saved, bus, reviews, bookings, now }) → pg
//     pg.stage · pg.stageInfo · pg.check() (at every band edge: a gate passed moves the stage on) · pg.gateLines(id)
//     pg.setStage(id) (debug) · serialize()
import { STAGES, STAGE_GATES, stageById, stageIndex, rankAtLeast } from '../../data/build.js';
import { MINUTES_PER_DAY } from './calendar.js';
import { setStage as setLiveStage } from './guests.js';
import { awardById } from '../../data/awards.js';
const awardName = (id) => awardById(id)?.name ?? id;

export const freshProgress = () => ({ stage: 'roadside', reached: { roadside: 0 } });

export function createProgress({ saved = null, bus = null, reviews = null, bookings = null, now = () => 0 } = {}) {
  const s = saved && STAGES.some((x) => x.id === saved.stage) ? { stage: saved.stage, reached: { ...(saved.reached ?? {}) } } : freshProgress();
  setLiveStage(s.stage); // (Milestone 18) who can book follows the stage
  const stays = () => bookings?.stats?.checkOuts ?? 0;
  let aw = null; // (Milestone 23) the awards (and Prestige), once attached
  const facts = () => ({ rank: reviews?.rank?.id ?? 'E', stars: reviews?.stars ?? 0, stays: stays() });
  // Each gate condition: [met, words].
  function gateParts(id) {
    const g = STAGE_GATES[id];
    if (!g) return [];
    const f = facts();
    const out = [];
    if (g.rank) out.push([rankAtLeast(f.rank, g.rank), `Rank ${g.rank}`]);
    if (g.stars) out.push([f.stars >= g.stars, `${g.stars}★ rating`]);
    if (g.stays) out.push([f.stays >= g.stays, `${g.stays} completed stays (${Math.min(f.stays, g.stays)} so far)`]);
    // (Milestone 23) the awards and Prestige are live
    if (g.award) out.push([!!aw?.won(g.award), `the ${awardName(g.award)} award`]);
    if (g.awards) out.push([new Set((aw?.wins ?? []).map((w) => w.id)).size >= g.awards, `${g.awards} different visible awards (${new Set((aw?.wins ?? []).map((w) => w.id)).size} so far)`]);
    if (g.prestige) out.push([(aw?.prestige ?? 0) >= g.prestige, `Prestige ${g.prestige}`]);
    if (g.secret) out.push([false, 'a secret']);
    return out;
  }
  const next = () => STAGES[stageIndex(s.stage) + 1] ?? null;
  const pg = {
    get stage() {
      return s.stage;
    },
    get stageInfo() {
      return stageById(s.stage);
    },
    get next() {
      return next();
    },
    gateLines: (id = next()?.id) => gateParts(id).map(([ok, words]) => ({ ok, words })),
    check() {
      const n = next();
      if (!n || n.secret) return false;
      const parts = gateParts(n.id);
      if (!parts.length || !parts.every(([ok]) => ok)) return false;
      pg.setStage(n.id);
      return true;
    },
    setStage(id) {
      if (!STAGES.some((x) => x.id === id) || id === s.stage) return false;
      s.stage = id;
      setLiveStage(id);
      s.reached[id] ??= Math.floor(now() / MINUTES_PER_DAY);
      bus?.emit('progress:stage', { stage: id, name: stageById(id).name });
      return true;
    },
    attachAwards(x) {
      aw = x;
    },
    serialize: () => JSON.parse(JSON.stringify(s)),
  };
  return pg;
}
