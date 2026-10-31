// Progress the speed unlocks read before their systems exist (Milestone 2, bible §3): the first award (awards: M23) and the
// Resort Rank. Milestone 5 fills in the Rank from the reviews' Reputation Points (src/systems/reviews.js); the first award
// still says "not yet".
//   run: the open campaign save (or null) — its `reviews` is the saved (or live) reviews state
import { rankReached } from './reviews.js';

export const PROGRESS_HOOKS = {
  firstAwardWon: (run) => false, // M23: true once the resort has won any award
  rankAtLeast: (run, rank) => rankReached(run?.reviews ?? null, rank), // (M5) true once the Resort Rank is `rank` or better (E → S)
};
