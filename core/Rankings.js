// A league table built from event results: every entrant in an event scores points for their placing
// (× the event's weight), plus wins, podiums, entries and head-to-head against one focus entrant (the player).
// Updated after each event; plain data in and out.
//
// config: { bus, points: [25, 18, 15, …] (1st, 2nd, …; places past the list score 0), focusId: 'player' }
export class Rankings {
  constructor({ bus = null, points, focusId = 'player' }) {
    this.bus = bus;
    this.points = points;
    this.focusId = focusId;
    this.reset();
  }

  reset() {
    this.rows = {}; // id → { points, wins, podiums, entries, aheadOfFocus, behindFocus }
    this.events = 0;
  }

  row(id) {
    return (this.rows[id] ||= { points: 0, wins: 0, podiums: 0, entries: 0, aheadOfFocus: 0, behindFocus: 0 });
  }

  // standings: [{ id, place, dnf }] from one event. weight: how much this event counts.
  record(standings, weight = 1) {
    const before = this.positionOf(this.focusId);
    const focus = standings.find((s) => s.id === this.focusId);
    for (const s of standings) {
      const r = this.row(s.id);
      r.entries++;
      if (!s.dnf) {
        r.points += Math.round((this.points[s.place - 1] ?? 0) * weight);
        if (s.place === 1) r.wins++;
        if (s.place <= 3) r.podiums++;
      }
      if (focus && s.id !== this.focusId) {
        if (!s.dnf && (focus.dnf || s.place < focus.place)) r.aheadOfFocus++;
        else r.behindFocus++;
      }
    }
    this.events++;
    const after = this.positionOf(this.focusId);
    this.bus?.emit('rankings:update', { before, after });
    return { before, after };
  }

  // Sorted table: points, then wins, then podiums. ids: which entrants to include (default: everyone seen).
  table(ids = null) {
    const list = (ids ?? Object.keys(this.rows)).map((id) => ({ id, ...this.row(id) }));
    list.sort((a, b) => b.points - a.points || b.wins - a.wins || b.podiums - a.podiums || a.id.localeCompare(b.id));
    return list.map((r, i) => ({ ...r, position: i + 1 }));
  }

  positionOf(id, ids = null) {
    if (!this.rows[id]) return null;
    return this.table(ids).find((r) => r.id === id)?.position ?? null;
  }

  serialize() {
    return JSON.parse(JSON.stringify({ rows: this.rows, events: this.events }));
  }

  load(data) {
    this.reset();
    if (!data) return false;
    this.rows = JSON.parse(JSON.stringify(data.rows ?? {}));
    this.events = data.events ?? 0;
    return true;
  }
}
