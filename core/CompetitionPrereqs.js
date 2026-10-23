// Competition prerequisites as data (event unlocks, trophies, and anything else that waits on results):
//   { type: 'eventWins', events: ['C04', …], min }   won at least `min` of these events (each counts once)
//   { type: 'eventEntered', event? }                  entered this event (or any event)
//   { type: 'totalWins', min }                        this many wins in total, any events
//   { type: 'trophy', id }                            own this trophy
// Everything else (rank, robot types, research, secrets…) is the game's; combine them with its 'all' rules.
// Returns true / false for these types, or null for a type this file doesn't know.
export const COMPETITION_RULE_TYPES = ['eventWins', 'eventEntered', 'totalWins', 'trophy'];

export function competitionRuleMet(rule, { competitions, trophies = null }) {
  const recs = competitions.records;
  switch (rule?.type) {
    case 'eventWins':
      return rule.events.filter((id) => (recs[id]?.wins ?? 0) > 0).length >= (rule.min ?? rule.events.length);
    case 'eventEntered':
      return rule.event ? (recs[rule.event]?.entries ?? 0) > 0 : competitions.totalEntries > 0;
    case 'totalWins':
      return competitions.totalWins >= (rule.min ?? 1);
    case 'trophy':
      return !!trophies?.has(rule.id);
    default:
      return null;
  }
}
