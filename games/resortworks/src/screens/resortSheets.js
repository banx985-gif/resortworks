// The Resort Hub's sheets (Milestone 1, style guide §3, bible §0.2): one builder for every facility, room, the guest and
// the Founder, on core/ui/StationSheet — header (picture, name, one line) and the live "Now" line only for now. Tapping
// the art and the bottom-bar shortcut both come here with the same id, so they always open the same sheet.
//   resortSheet(world, id, { accent }) → a core/ui/BottomSheet menu (key: the thing's id), or null
import { stationSheet } from '../../../../core/ui/StationSheet.js';
import { THEME } from '../../../../core/Theme.js';
import { GUEST } from '../../data/lot.js';

const C = THEME.color;

export function resortSheet(world, id, { accent = C.progress } = {}) {
  const it = world?.byId(id);
  if (!it) return null;
  const now = [world.stateOf(it)];
  let spec;
  if (it.kind === 'guest') spec = { title: GUEST.title, line: GUEST.type, art: GUEST.sheetArt, now };
  else if (it.kind === 'staff') spec = { title: world.founder.name, line: world.role.name, art: world.founder.art, tag: { text: 'FOUNDER', color: C.purple }, now };
  else if (it.kind === 'room') spec = { title: it.def.name, line: it.def.type, art: it.def.art, now };
  else spec = { title: it.def.name, line: it.def.line, art: it.def.art, now };
  return { ...stationSheet({ ...spec, accent, text: { now: 'Now' } }), key: id };
}
