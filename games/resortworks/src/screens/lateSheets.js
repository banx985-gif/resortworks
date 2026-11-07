// The sheets of the systems from Milestone 18 on (plain specs for core/ui/BottomSheet, like resortSheets.js). The screen
// opens one with act.panel(key, arg) and does what its buttons ask with act.do(op, ...args) (LATE_OPS below: each
// returns { why } to show one plain line, or { say }, and the sheet is drawn again from the live state).
//   LATE_SHEETS[key](run, arg, { act, accent, today, dateOf }) → spec
//   LATE_OPS[op](run, ...args) → { why?, say? }
//   office    — the Resort Office (the series Menu button, bible §0.2): every manager's sheet in one list, with the
//               next step to take
//   packages  — (Milestone 18) the 10 packages: price, stay, inclusions, demand; put each on sale; places today
import { THEME } from '../../../../core/Theme.js';
import { PACKAGES, packageById } from '../../data/packages.js';
import { GUEST_TYPES } from '../../data/bookings.js';
import { credits } from '../systems/finance.js';
import { facilityInfo } from '../../data/facilities.js';

const C = THEME.color;
const pct = (x) => `${x > 0 ? '+' : ''}${Math.round(x * 100)}%`;
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const nightsWords = (p) => (p.nights[0] === p.nights[1] ? plural(p.nights[0], 'night') : `${p.nights[0]}–${p.nights[1]} nights`);
const back = (act) => ({ columns: 1, buttons: [{ id: 'panel:back', label: '‹ Resort Office', accent: C.textMuted, onTap: () => act.panel('office') }] });

// The Resort Office: one row per manager's sheet (each with its one-line state), the next step first.
function officeSheet(run, arg, { act, accent }) {
  const rows = [];
  const pk = run.packages;
  if (pk) {
    const on = pk.onSale().length;
    const open = PACKAGES.filter((p) => !pk.whyOff(p.id)).length;
    rows.push({ id: 'office:packages', icon: 'ui_26', label: 'Packages', sub: `${on} on sale · ${open} of 10 can be sold`, accent: C.progress, onTap: () => act.panel('packages') });
  }
  const next = nextStep(run);
  return {
    key: 'panel:office',
    title: 'Resort Office',
    subtitle: 'Everything you manage, in one place.',
    art: 'ui_05',
    accent,
    sections: [{ lines: next ? [{ text: `Next: ${next}`, color: C.action }] : [] }, { title: 'Manage', std: 'office:rows', columns: 1, buttons: rows }],
  };
}
// One plain next step (the series hint line).
export function nextStep(run) {
  const pk = run.packages;
  if (pk && !pk.onSale().length && PACKAGES.some((p) => !pk.whyOff(p.id))) return 'put a package on sale (Packages).';
  return null;
}

function packagesSheet(run, arg, { act, accent, today = 0 }) {
  const pk = run.packages;
  const st = pk.stats;
  const sections = [{ lines: [{ text: 'A package is a room plus extras at one price: the room’s nightly rate × the package’s multiplier. Its places are kept for the guest when you accept.', color: C.textMuted }, { text: 'Sold so far', right: String(Object.values(st.sold).reduce((t, n) => t + n, 0)) }, { text: 'Extras given / missed', right: `${st.delivered} / ${st.failed}` }] }];
  for (const p of PACKAGES) {
    const why = pk.whyOff(p.id);
    const on = pk.isOn(p.id);
    const incl = p.incl.map((i) => i.name).join(' + ');
    const sub = why ?? `${nightsWords(p)} · ×${p.mult.toFixed(2)} the room rate · ${incl} · ${p.demandWords}${st.sold[p.id] ? ` · ${st.sold[p.id]} sold` : ''}`;
    sections.push({
      std: `pkg:${p.id}`,
      columns: 1,
      buttons: [{ id: `pkg:${p.id}`, icon: p.art, label: `${on ? '✓ ' : ''}${p.name}`, sub, cost: why ? 'Locked' : on ? 'On sale' : 'Off', accent: why ? C.textMuted : on ? C.good : C.action, disabled: !!why, onTap: () => act.do('pkgToggle', p.id) }],
    });
  }
  // places reserved today at each facility that gives package places
  const facs = [...new Set(PACKAGES.flatMap((p) => p.incl.flatMap((i) => i.facs ?? [])))].filter((f) => pk.placesFor(f) > 0);
  if (facs.length) sections.push({ title: 'Package places today', std: 'pkg:places', lines: facs.map((f) => ({ text: facilityInfo(f)?.name ?? f, right: `${pk.reservedOn(today, f)} of ${pk.placesFor(f)}` })) });
  sections.push(back(act));
  return { key: 'panel:packages', title: 'Packages', subtitle: 'Bundles that bring the guests they suit.', art: 'ui_26', accent, sections };
}

export const LATE_SHEETS = { office: officeSheet, packages: packagesSheet };

export const LATE_OPS = {
  pkgToggle(run, id) {
    const pk = run.packages;
    if (!pk) return null;
    const why = pk.whyOff(id);
    if (why) return { why };
    pk.setOn(id, !pk.isOn(id));
    return { say: `${packageById(id).name}: ${pk.isOn(id) ? 'on sale' : 'off sale'}.` };
  },
};

// (Reception) a package offer's words: "Family Week package · 1,940 Cr a night".
export const packageWords = (o) => {
  const p = packageById(o?.pkg);
  return p ? `${p.name} package` : '';
};
export const packageRate = (o) => {
  const p = packageById(o?.pkg);
  return p ? Math.round(o.rate * p.mult) : o.rate;
};
export { GUEST_TYPES, credits };
