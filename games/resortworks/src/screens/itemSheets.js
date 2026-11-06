// Staff Items sheets (Milestone 14, bible §27D2): the store (the Inbox first, then the items by group — each one's effect
// and rarity), who loves / dislikes which group, and an item's own sheet: every staff member with the exact gain they would
// get (loved ×1.5, disliked ×0.5, the stat cap, the year's item points) and why not, then Sell. Plain specs for
// core/ui/BottomSheet; the screen does what the buttons ask (act.*).
//   itemsSheet(items, team, { act, accent }) · itemSheet(items, team, uid, { act, accent })
import { THEME } from '../../../../core/Theme.js';
import { ITEM_GROUPS, ITEM_RARITIES, ITEM_RULES, ITEMS_ICON, itemType } from '../../data/items.js';
import { STAT_NAMES } from '../../data/staff.js';
import { itemStats } from '../systems/items.js';
import { credits } from '../systems/finance.js';

const C = THEME.color;
const groupName = (id) => ITEM_GROUPS.find((g) => g.id === id)?.name ?? id;
const effectWords = (t) => (t.stat === 'primary' ? `primary role stat +${t.gain}` : t.stat === 'both' ? `both role stats +${t.gain} each` : `${STAT_NAMES[t.stat]} +${t.gain}`);

export function itemsSheet(items, team, { act, accent = C.progress } = {}) {
  const sections = [];
  const inv = items.inventory;
  sections.push({ lines: [{ text: 'Give an item to raise a stat for good. Loved groups give ×1.5 and +3 Morale; disliked ones ×0.5.', color: C.textMuted }, { text: 'In the store', right: `${inv.length} of ${items.max}` }] });
  if (items.inbox.length)
    sections.push({
      title: 'Inbox (the store was full)',
      std: 'items:inbox',
      columns: 1,
      buttons: items.inbox.map((e) => {
        const t = itemType(e.type);
        return { id: `claim:${e.id}`, icon: t.art, label: t.name, sub: `Take it into the store · goes on day ${e.expires + 1}`, cost: ITEM_RARITIES[e.rarity].name, accent: C.progress, onTap: () => act.claimItem(e.id) };
      }),
    });
  for (const g of ITEM_GROUPS) {
    const mine = inv.filter((x) => itemType(x.type)?.group === g.id);
    if (!mine.length) continue;
    sections.push({
      title: g.name,
      std: `items:${g.id}`,
      columns: 1,
      buttons: mine.map((x) => {
        const t = itemType(x.type);
        return { id: `item:${x.uid}`, icon: t.art, label: t.name, sub: `${ITEM_RARITIES[x.rarity].name} · ${effectWords(t)}`, cost: `Sell ${credits(items.sellValue(x.uid))}`, accent: C.action, onTap: () => act.staffItem(x.uid) };
      }),
    });
  }
  if (!inv.length) sections.push({ lines: [{ text: 'No items yet. They come from excellent stays, great training sessions and well-wishers — never from the shop.', color: C.textMuted }] });
  sections.push({
    title: 'Who likes what',
    std: 'items:likes',
    lines: team.map((m) => {
      const lk = items.likesOf(m.id);
      return { text: m.name, right: `♥ ${lk.loves.map(groupName).join(', ')}${lk.dislike ? ` · ✗ ${groupName(lk.dislike)}` : ''} · ${items.pointsLeft(m.id)} pts left` };
    }),
  });
  sections.push({ columns: 1, buttons: [{ id: 'items:back', label: '‹ Back to the team', accent: C.textMuted, onTap: () => act.open('F02') }] });
  return { key: 'items', title: 'Staff Items', subtitle: `Up to ${ITEM_RULES.yearPoints} item points for each person each year.`, art: ITEMS_ICON, accent, sections };
}

export function itemSheet(items, team, uid, { act, accent = C.progress } = {}) {
  const it = items.inventory.find((x) => x.uid === uid);
  if (!it) return null;
  const t = itemType(it.type);
  const rar = ITEM_RARITIES[it.rarity];
  const buttons = team.map((m) => {
    const pv = items.preview(uid, m.id);
    const like = pv.like === 'love' ? '♥ loves it · ' : pv.like === 'dislike' ? '✗ not keen · ' : '';
    const stats = itemStats(t, m.role);
    const gain = pv.ok ? stats.map((k) => `${STAT_NAMES[k]} +${pv.gains[k]}`).join(', ') : pv.why;
    const warn = pv.ok && pv.lost ? ` (${pv.lost} lost at the cap)` : '';
    return { id: `give:${uid}:${m.id}`, icon: m.art, label: m.name, sub: `${like}${gain}${warn} · ${items.pointsLeft(m.id)} pts left`, cost: pv.ok ? `${rar.points} pt${rar.points === 1 ? '' : 's'}` : '', accent: pv.ok ? (pv.like === 'love' ? C.good : C.action) : C.textMuted, disabled: !pv.ok, onTap: () => act.giveItem(uid, m.id) };
  });
  return {
    key: `item:${uid}`,
    title: t.name,
    subtitle: `${rar.name} · ${groupName(t.group)} · ${effectWords(t)}`,
    art: t.art,
    accent,
    sections: [
      { title: 'Give it to', std: 'item:give', columns: 1, buttons },
      { std: 'item:sell', columns: 1, buttons: [{ id: `sellItem:${uid}`, label: 'Sell it', sub: 'A spare goes back for Credits', cost: credits(items.sellValue(uid)), accent: C.bad, onTap: () => act.sellItem(uid) }, { id: 'item:back', label: '‹ Staff Items', accent: C.textMuted, onTap: () => act.items() }] },
    ],
  };
}
