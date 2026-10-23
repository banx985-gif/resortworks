// Progress the speed unlocks read before their systems exist (Milestone 2, bible §3): the first award (awards: M23) and the
// Resort Rank (the rank milestone). Both say "not yet" for now — those milestones fill them in here, nothing else changes.
//   run: the open campaign save (or null)
export const PROGRESS_HOOKS = {
  firstAwardWon: (run) => false, // M23: true once the resort has won any award
  rankAtLeast: (run, rank) => false, // rank milestone: true once the Resort Rank is `rank` or better (E → S)
};
