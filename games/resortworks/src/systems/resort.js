// A new resort's campaign save and its slot summary (Milestone 0, bible §5 / §33). The campaign is empty for now — the
// resort's identity and the date; the simulation's state joins it milestone by milestone (with SAVE_MIGRATIONS).
import { founderById, paletteById, ROLES, FOUNDER_FLAG } from '../../data/setup.js';

export const managerLine = (name) => `General Manager ${name || '…'}`;

// setup: { resort, manager, palette, founder } from Resort Setup.
export function newCampaign(setup, now = Date.now()) {
  const founder = founderById(setup.founder);
  if (!founder) throw new Error(`Unknown founder ${setup.founder}`);
  if (!setup.resort?.trim() || !setup.manager?.trim()) throw new Error('A resort needs a name and a General Manager');
  return {
    resort: {
      name: setup.resort.trim(),
      manager: setup.manager.trim(),
      palette: paletteById(setup.palette).id,
      founder: { id: founder.id, [FOUNDER_FLAG]: true }, // the permanent Founder history flag (bible §5)
      createdAt: now,
    },
    seed: `resortworks-${now}`, // the run's seed, fixed at creation (a reload never rerolls it)
    date: { year: 1, month: 1, day: 1 },
    playSec: 0,
    ngPlus: 0,
  };
}

// The small record the Campaign Slots screen reads (bible §5: resort, manager, Founder, Year/Month, stage, star rating,
// Prestige, NG+, playtime and ending grade) without loading the campaign. Stage / stars / Prestige / grade stay blank or
// zero until their systems exist.
export function slotSummary(data) {
  const r = data.resort;
  const founder = founderById(r.founder.id);
  return {
    resort: r.name,
    manager: r.manager,
    palette: r.palette,
    founderId: founder?.id ?? r.founder.id,
    founderName: founder?.name ?? r.founder.id,
    founderRole: founder ? ROLES[founder.role].name : '',
    year: data.date.year,
    month: data.date.month,
    stage: data.stage ?? null,
    stars: data.stars ?? 0,
    prestige: data.prestige ?? 0,
    ngPlus: data.ngPlus ?? 0,
    playSec: data.playSec ?? 0,
    grade: data.grade ?? null,
  };
}

// "2h 05m" (playtime on the slot card).
export function playTime(sec) {
  const m = Math.floor((sec ?? 0) / 60);
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

// Save version → upgrade (none yet: version 1 is Milestone 0).
export const SAVE_MIGRATIONS = {};
